import axios, { AxiosError } from "axios";
import { getLogger } from "guzek-uk-common/logger";
import {
  TorrentInfo,
  TORRENT_DOWNLOAD_PATH,
  BasicEpisode,
  ConvertedTorrentInfo,
} from "guzek-uk-common/models";
import { convertTorrentInfo } from "guzek-uk-common/util";

const SESSION_ID_HEADER_NAME = "X-Transmission-Session-Id";
const SESSION_ID_PATTERN = /<code>X-Transmission-Session-Id: (.+)<\/code>/;
const FIELDS = [
  "id",
  "name",
  "status",
  "rateDownload",
  "percentDone",
  // leftUntilDone: Estimated download duration in microseconds (/1000 /1000 /60 for minutes)
  "leftUntilDone",
  // ETA: Estimated download duration in seconds (/60 for minutes)
  "eta",
];
/** The free space required for new torrents to be downloaded. Default: 1 GiB. */
const MIN_REQUIRED_KEBIBYTES = 1048576;

const TRANSMISSION_URL =
  process.env.TRANSMISSION_URL ?? "http://localhost:9091/transmission/rpc";

const logger = getLogger(__filename);

type Method =
  | "session-get"
  | "session-stats"
  | "torrent-get"
  | "free-space"
  | "torrent-add"
  | "torrent-remove";

type TorrentResponse<T extends Method> = T extends "session-get"
  ? string
  : T extends "torrent-get"
  ? { arguments: { torrents: TorrentInfo[] } }
  : T extends "free-space"
  ? { arguments: { "size-bytes": number } }
  : T extends "torrent-add"
  ? { arguments: { "torrent-added"?: TorrentInfo } }
  : T extends "torrent-remove"
  ? { arguments: {} }
  : { arguments: Record<string, any> };

type ExemptMethod = "session-get" | "session-stats";

export class TorrentClient {
  auth?: { username: string; password: string };
  sessionId?: string;
  numTorrents: number = 0;
  private initPromise: Promise<void> | null = null;

  constructor() {
    const auth = process.env.TR_AUTH;

    if (!auth) {
      logger.error("No TR_AUTH variable set.");
      return;
    }
    const [username, password] = auth.split(":");
    this.auth = { username, password };
    this.initPromise = this.init();
  }

  private updateSessionId(resData: string) {
    this.sessionId = resData.match(SESSION_ID_PATTERN)?.[1];
  }

  private async init() {
    const resSessionId = await this.fetch("session-get");
    this.updateSessionId(resSessionId);
    if (this.sessionId == null) {
      logger.error("Could not establish the session id.");
      return;
    }
    const resSessionStats = await this.fetch("session-stats");
    this.numTorrents = resSessionStats.arguments.torrentCount;
  }

  /**
   * Optionally waits for the torrent client to initialise, so that errors can be caught. Note that this is not necessary,
   * as the client will wait for initialisation itself before sending any requests. However, if the client encounters an
   * error during initialisation and this method isn't called, the error will not be caught and may propagate into stderr.
   * @returns a boolean indicating if the client was in the process of initialising.
   */
  async waitForInitialisation() {
    if (this.initPromise == null) return false;
    await this.initPromise;
    return true;
  }

  private async fetch<T extends Method>(
    method: T,
    ...[args]: T extends ExemptMethod ? [] : [args: Record<string, any>]
  ): Promise<TorrentResponse<T>> {
    if (!method.startsWith("session") && (await this.waitForInitialisation())) {
      this.initPromise = null;
    }

    let res;
    try {
      res = await axios({
        url: TRANSMISSION_URL,
        method: "POST",
        auth: this.auth,
        data: {
          method,
          arguments: args,
        },
        headers: { [SESSION_ID_HEADER_NAME]: this.sessionId ?? "" },
      });
    } catch (error) {
      res = (error as AxiosError).response;
      if (!res) {
        logger.error("Could not obtain a response from the torrent daemon.");
        throw error;
      }
      if (method !== "session-get") {
        if (res.status === 409) {
          this.updateSessionId(res.data as string);
          const passed = [args] as T extends ExemptMethod
            ? []
            : [args: Record<string, any>];
          logger.warn("Recursing due to 409 client response");
          return await this.fetch(method, ...passed);
        }
        logger.error(`Client response: ${res.status} ${res.statusText}`);
      }
    }
    return res.data as TorrentResponse<T>;
  }

  private async getTorrents() {
    const response = await this.fetch("torrent-get", { fields: FIELDS });
    if (!response.arguments) {
      logger.error("Invalid response " + JSON.stringify(response));
      return [];
    }
    return response.arguments.torrents;
  }

  async getAllTorrentInfos() {
    const torrents = await this.getTorrents();
    return torrents.reduce((mapped, current) => {
      try {
        mapped.push(convertTorrentInfo(current));
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("doesn't match regex")
        )
          throw error;
      }
      return mapped;
    }, [] as ConvertedTorrentInfo[]);
  }

  async getTorrentInfo(episode: BasicEpisode) {
    const torrents = await this.getTorrents();
    const showNameLower = episode.showName.toLowerCase();
    return torrents.find((torrent) => {
      const convertedTorrent = convertTorrentInfo(torrent);
      return (
        convertedTorrent.season === episode.season &&
        convertedTorrent.episode === episode.episode &&
        convertedTorrent.showName.toLowerCase() === showNameLower
      );
    });
  }

  async addTorrent(link: string, createEntry?: () => Promise<any>) {
    const resFreeSpace = await this.fetch("free-space", {
      path: TORRENT_DOWNLOAD_PATH,
    });
    const freeBytes = resFreeSpace.arguments["size-bytes"];
    if (!freeBytes) return null;
    const freeKebiBytes = Math.floor(freeBytes / 1024);
    if (freeKebiBytes < MIN_REQUIRED_KEBIBYTES) {
      logger.error(
        `Not enough free space to download torrent. Free space: ${freeKebiBytes} KiB`
      );
      return null;
    }

    const resTorrentAdd = await this.fetch("torrent-add", {
      filename: link,
      "download-dir": TORRENT_DOWNLOAD_PATH,
      paused: false,
    });
    const torrent = resTorrentAdd.arguments["torrent-added"];
    if (!torrent) {
      logger.info(
        "Duplicate file; no torrents added. Creating database entry."
      );
      if (createEntry) await createEntry();
      return null;
    }
    this.numTorrents++;
    return convertTorrentInfo(torrent);
  }

  async removeTorrent(torrent: TorrentInfo) {
    const resRemoveTorrent = await this.fetch("torrent-remove", {
      id: torrent.id,
    });
    logger.debug(JSON.stringify(resRemoveTorrent));
  }
}
