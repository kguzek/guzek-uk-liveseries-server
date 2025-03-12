import type { Context } from "elysia";
import { Elysia, t } from "elysia";

import type {
  BasicTvShow,
  ConvertedTorrentInfo,
  Episode,
  TorrentInfo,
} from "@/lib/types";
import { TORRENT_DOWNLOAD_PATH } from "@/lib/constants";
import { getRequestIp } from "@/lib/http";
import {
  parseEpisodeRequest,
  sanitiseShowName,
  searchForDownloadedEpisode,
  serialiseEpisode,
  torrentClient,
} from "@/lib/liveseries";
import { getLogger } from "@/lib/logger";
import { episodeSchema } from "@/lib/schemas";
import { TorrentIndexer } from "@/torrent-indexers";
import { Eztv } from "@/torrent-indexers/eztv";

const logger = getLogger(__filename);

const WS_MESSAGE_INTERVAL_MS = 3000;

const torrentIndexer: TorrentIndexer = new Eztv();

const currentTimeouts: Record<number, () => Promise<void>> = {};
let lastMessageTimestamp = 0;

export function sendWebsocketMessage() {
  logger.verbose("Speeding up websocket message");
  lastMessageTimestamp = 0;
  for (const [timeout, callback] of Object.entries(currentTimeouts)) {
    clearTimeout(+timeout);
    callback();
  }
}

class EpisodeAlreadyDownloadedError extends Error {}

async function tryDownloadEpisode(data: BasicTvShow & Episode) {
  const { showName, ...where } = data;
  const result = await DownloadedEpisode.findOne({ where });
  if (result) {
    throw new EpisodeAlreadyDownloadedError();
  }
  return downloadEpisode(data);
}

async function downloadEpisode(
  data: BasicTvShow & Episode,
): Promise<ConvertedTorrentInfo | null> {
  const result = await torrentIndexer.findTopResult(data);
  if (!result || !result.link) {
    logger.error(
      "Search query turned up empty. Either no torrents available, or indexer is outdated.",
    );
    return null;
  }

  const modelParams = { ...data };
  const createEntry = () => DownloadedEpisode.create(modelParams);
  let torrentInfo: ConvertedTorrentInfo | null;
  try {
    torrentInfo = await torrentClient.addTorrent(result.link, createEntry);
  } catch {
    logger.error("The torrent client is unavailable");
    return null;
  }
  // TODO: why is this commented out?
  // if (!torrentInfo) {
  //   logger.error(`Adding the torrent to the client failed.`);
  //   return null;
  // }
  await createEntry();
  logger.info("Successfully added new torrent.");
  sendWebsocketMessage();
  return torrentInfo;
}

async function deleteEpisode(
  ctx: Pick<Context, "set">,
  episode: Episode,
  torrent?: TorrentInfo,
) {
  logger.info(`Deleting episode '${episode.showName}' ${serialiseEpisode(episode)}`);
  let destroyedRows;
  try {
    destroyedRows = await DownloadedEpisode.destroy({
      where: { ...episode, showName: sanitiseShowName(episode.showName) },
    });
  } catch (error) {
    logger.error("Could not delete database entry:", error);
    ctx.set.status = 500;
    return {
      message: "Could not delete the episode from the database.",
    };
  }
  if (!destroyedRows) {
    ctx.set.status = 404;
    return {
      message: "Episode not found in the database.",
    };
  }
  let filename: string | void;
  let file;
  if (torrent) {
    try {
      await torrentClient.removeTorrent(torrent);
    } catch (error) {
      logger.error("Could not remove torrent:", error);
      ctx.set.status = 500;
      return {
        message: `An unknown error occured while removing the torrent. The database entry was removed.`,
      };
    }
    sendWebsocketMessage();
    filename = torrent.name;
    file = Bun.file(TORRENT_DOWNLOAD_PATH + filename);
  } else {
    const result = await searchForDownloadedEpisode(ctx, episode);
    if (result.error != null) {
      return result.error;
    }
    file = result.file;
  }

  try {
    await file.delete();
  } catch (error) {
    logger.error(error);
    ctx.set.status = 500;
    return {
      message: `An unknown error occurred while removing the files. The ${
        torrent ? "torrent and database entry were" : "database entry was"
      } removed.`,
    };
  }

  return { message: "Episode deleted successfully." };
}

// START downloading episode
new Elysia()
  .post(
    "/",
    async (ctx) => {
      const showName = ctx.body?.showName;
      const showId = +ctx.body?.showId;
      const season = +ctx.body?.season;
      const episode = +ctx.body?.episode;

      const serialised = `'${showName}' ${serialiseEpisode({ episode, season })}`;
      let downloadedEpisode: ConvertedTorrentInfo | null;
      try {
        downloadedEpisode = await tryDownloadEpisode({
          showName,
          showId,
          episode,
          season,
        });
      } catch (error) {
        if (!(error instanceof EpisodeAlreadyDownloadedError)) throw error;
        ctx.set.status = 409;
        return {
          message: `Episode ${serialised} is already downloaded.`,
        };
      }
      if (downloadedEpisode) {
        return downloadedEpisode;
      }
      ctx.set.status = 400;
      return {
        message: `Invalid episode ${serialised}`,
      };
    },
    {
      body: t.Intersect([episodeSchema, t.Object({ showId: t.Integer({ minimum: 1 }) })]),
    },
  )

  // DELETE downloaded episode from server
  .delete(
    "/:showName/:season/:episode",
    (ctx) => {
      const episode = parseEpisodeRequest(ctx);
      return deleteEpisode(ctx, episode);
    },
    {
      params: episodeSchema,
    },
  )

  // GET all downloaded episodes
  .ws("/ws", (ctx) => {
    if (!torrentClient) {
      logger.error("Websocket connection established without active torrent client.");
      return;
    }

    const username = req.user?.username ?? "<anonymous>";
    lastMessageTimestamp = 0;

    ws.on("message", (msg) => {
      let evt: { type: string; data: any };

      try {
        evt = JSON.parse(msg.toString());
      } catch (error) {
        logger.error(`Could not parse websocket message '${msg}':`, error);
        return;
      }

      /** The callback to call after a message event which should resolve to the data to be sent back. */
      let action: (data: any) => Promise<ConvertedTorrentInfo[]>;

      let delayMultiplier = 1;

      switch (evt.type) {
        case "poll":
          action = () => torrentClient.getAllTorrentInfos();
          const torrents = evt.data as ConvertedTorrentInfo[];
          // Enable longer response times if all downloads are complete
          if (torrents && Array.isArray(torrents)) {
            if (!torrents.find((torrent) => torrent.status !== DownloadStatus.COMPLETE))
              delayMultiplier = 20;
          } else {
            logger.warn(`Received invalid data argument for poll message:`, torrents);
            delayMultiplier = 5;
          }
          break;
        default:
          logger.warn(
            `Unknown message type '${evt.type}' received in websocket connection.`,
          );
          return;
      }

      const currentTimestamp = new Date().getTime();
      const ping = Math.max(0, currentTimestamp - lastMessageTimestamp);
      const delayMs = Math.max(0, WS_MESSAGE_INTERVAL_MS * delayMultiplier - ping);
      lastMessageTimestamp = currentTimestamp + delayMs;
      logger.verbose(`Sending message in ${delayMs / 1000} s`);
      const currentTimeout = +global.setTimeout(nextMessageCallback, delayMs);
      currentTimeouts[currentTimeout] = nextMessageCallback;

      async function nextMessageCallback() {
        delete currentTimeouts[currentTimeout];

        let data: ConvertedTorrentInfo[] = [];
        try {
          data = await action(evt.data);
        } catch (error) {
          logger.error("Error while performing websocket action:", error);
        }
        const message = JSON.stringify({ data });
        ws.send(message);
      }
    });

    ws.on("close", (event) => {
      logger.http(
        `Websocket connection with ${getRequestIp(ctx)} (${username}) closed.`,
        event,
      );
    });

    ws.on("error", (error) => {
      logger.error(`Websocket error with ${getRequestIp(ctx)} (${username}):`, error);
    });
  })
  .all("/ws", (ctx) => {
    ctx.set.status = 400;
    return {
      message: `Websocket upgrade required for path ${ctx.path}.`,
    };
  });
