import express, { Response } from "express";
import expressWs from "express-ws";
import fs from "fs/promises";
import { getLogger } from "guzek-uk-common/lib/logger";
import { DownloadStatus } from "guzek-uk-common/enums";
import type {
  BasicEpisode,
  BasicTvShow,
  ConvertedTorrentInfo,
  CustomRequest,
  TorrentInfo,
} from "guzek-uk-common/models";
import {
  DownloadedEpisode,
  sanitiseShowName,
} from "guzek-uk-common/lib/sequelize";
import { getRequestIp, sendError, sendOK } from "guzek-uk-common/lib/http";
import {
  serialiseEpisode,
  validateNaturalNumber,
} from "guzek-uk-common/lib/util";
import { TorrentIndexer } from "../../torrentIndexers/torrentIndexer";
import { Eztv } from "../../torrentIndexers/eztv";
import {
  EpisodeNotFoundError,
  handleTorrentRequest,
  searchForDownloadedEpisode,
  torrentClient,
} from "../../liveseries";
import { TORRENT_DOWNLOAD_PATH } from "../../config";

export const router = express.Router() as expressWs.Router;
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

async function tryDownloadEpisode(data: BasicTvShow & BasicEpisode) {
  const { showName, ...where } = data;
  const result = await DownloadedEpisode.findOne({ where });
  if (result) {
    throw new EpisodeAlreadyDownloadedError();
  }
  return downloadEpisode(data);
}

async function downloadEpisode(
  data: BasicTvShow & BasicEpisode,
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
  res: Response,
  episode: BasicEpisode,
  torrent?: TorrentInfo,
) {
  logger.info(
    `Deleting episode '${episode.showName}' ${serialiseEpisode(episode)}`,
  );
  let destroyedRows;
  try {
    destroyedRows = await DownloadedEpisode.destroy({
      where: { ...episode, showName: sanitiseShowName(episode.showName) },
    });
  } catch (error) {
    logger.error("Could not delete database entry:", error);
    return sendError(res, 500, {
      message: "Could not delete the episode from the database.",
    });
  }
  if (!destroyedRows) {
    throw new EpisodeNotFoundError();
  }
  let filename: string | void;
  if (torrent) {
    try {
      await torrentClient.removeTorrent(torrent);
    } catch (error) {
      logger.error("Could not remove torrent:", error);
      return sendError(res, 500, {
        message: `An unknown error occured while removing the torrent. The database entry was removed.`,
      });
    }
    sendWebsocketMessage();
    filename = torrent.name;
  } else {
    try {
      filename = await searchForDownloadedEpisode(res, episode);
    } catch (error) {
      if (!(error instanceof EpisodeNotFoundError)) throw error;
      return sendError(res, 500, {
        message: `Neither the torrent nor the episode files could be found. The database entry was removed.`,
      });
    }
  }

  if (!filename) return;

  try {
    await fs.rm(TORRENT_DOWNLOAD_PATH + filename, { recursive: true });
  } catch (error) {
    logger.error(error);
    return sendError(res, 500, {
      message: `An unknown error occurred while removing the files. The ${
        torrent ? "torrent and database entry were" : "database entry was"
      } removed.`,
    });
  }

  sendOK(res);
}

// START downloading episode
router.post("/", async (req, res) => {
  const showName = req.body?.showName;
  const showId = +req.body?.showId;
  const season = +req.body?.season;
  const episode = +req.body?.episode;

  const errorMessage =
    (validateNaturalNumber(showId) ??
    validateNaturalNumber(season) ??
    validateNaturalNumber(episode) ??
    showName)
      ? null
      : "Request body is missing property `showName`.";

  if (errorMessage) return sendError(res, 400, { message: errorMessage });
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
    sendError(res, 409, {
      message: `Episode ${serialised} is already downloaded.`,
    });
    return;
  }
  if (downloadedEpisode) {
    sendOK(res, downloadedEpisode);
  } else {
    sendError(res, 400, {
      message: `Invalid episode ${serialised}`,
    });
  }
});

// DELETE downloaded episode from server
router.delete("/:showName/:season/:episode", (req, res) =>
  handleTorrentRequest(
    req,
    res,
    (torrent, episode) => deleteEpisode(res, episode, torrent),
    (episode) => deleteEpisode(res, episode),
  ),
);

// GET all downloaded episodes
router.ws("/ws", (ws, req: CustomRequest) => {
  if (!torrentClient) {
    logger.error(
      "Websocket connection established without active torrent client.",
    );
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
          if (
            !torrents.find(
              (torrent) => torrent.status !== DownloadStatus.COMPLETE,
            )
          )
            delayMultiplier = 20;
        } else {
          logger.warn(
            `Received invalid data argument for poll message:`,
            torrents,
          );
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
    const delayMs = Math.max(
      0,
      WS_MESSAGE_INTERVAL_MS * delayMultiplier - ping,
    );
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
      `Websocket connection with ${getRequestIp(req)} (${username}) closed.`,
      event,
    );
  });

  ws.on("error", (error) => {
    logger.error(
      `Websocket error with ${getRequestIp(req)} (${username}):`,
      error,
    );
  });
});
router.all("/ws", (req, res) => {
  sendError(res, 400, {
    message: `Websocket upgrade required for path ${req.path}.`,
  });
});
