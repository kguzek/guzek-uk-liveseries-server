import express from "express";
import expressWs from "express-ws";
import { getLogger } from "guzek-uk-common/logger";
import {
  ConvertedTorrentInfo,
  DownloadStatus,
  Episode,
  TvShow,
} from "guzek-uk-common/models";
import { DownloadedEpisode } from "guzek-uk-common/sequelize";
import {
  sendError,
  sendOK,
  serialiseEpisode,
  validateNaturalNumber,
} from "guzek-uk-common/util";
import { TorrentIndexer } from "../../torrentIndexers/torrentIndexer";
import { Eztv } from "../../torrentIndexers/eztv";
import { torrentClient } from "../../liveseries";
import { TorrentClient } from "../../torrentClient";

export const router = express.Router() as expressWs.Router;
const logger = getLogger(__filename);

const WS_MESSAGE_INTERVAL_MS = 3000;

const torrentIndexer: TorrentIndexer = new Eztv();

const currentTimeouts: Record<number, () => Promise<void>> = {};
let lastMessageTimestamp = 0;

export function sendWebsocketMessage() {
  logger.debug("Speeding up websocket message");
  lastMessageTimestamp = 0;
  for (const [timeout, callback] of Object.entries(currentTimeouts)) {
    clearTimeout(+timeout);
    callback();
  }
}
async function tryDownloadEpisode(tvShow: TvShow, episode: Episode) {
  const result = await DownloadedEpisode.findOne({
    where: {
      showId: tvShow.id,
      episode: episode.episode,
      season: episode.season,
    },
  });
  logger.debug("Result is: " + result);
  return result ? null : await downloadEpisode(tvShow, episode);
}

async function downloadEpisode(tvShow: TvShow, episode: Episode) {
  const result = await torrentIndexer.findTopResult({
    ...episode,
    showName: tvShow.name,
  });
  if (!result || !result.link) {
    logger.error(
      "Search query turned up empty. Either no torrents available, or indexer is outdated."
    );
    return null;
  }

  const createEntry = () =>
    DownloadedEpisode.create({
      showId: tvShow.id,
      showName: tvShow.name,
      episode: episode.episode,
      season: episode.season,
    });
  let torrentInfo: Awaited<ReturnType<TorrentClient["addTorrent"]>>;
  try {
    torrentInfo = await torrentClient.addTorrent(result.link, createEntry);
  } catch {
    logger.error("The torrent client is unavailable");
    return null;
  }
  if (!torrentInfo) {
    logger.error(`Adding the torrent to the client failed.`);
    return null;
  }
  await createEntry();
  logger.info(`Successfully added new torrent.`);
  sendWebsocketMessage();
  return torrentInfo;
}

// START downloading episode
router.post("/downloaded-episodes", async (req, res) => {
  const tvShow: TvShow = req.body.tvShow;
  const episode: Episode = req.body.episode;

  const errorMessage =
    validateNaturalNumber(tvShow?.id) ??
    validateNaturalNumber(episode.season) ??
    validateNaturalNumber(episode.episode) ??
    tvShow.name
      ? null
      : "Request body `tvShow` object is missing property `name`.";

  if (errorMessage) return sendError(res, 400, { message: errorMessage });

  const downloadedEpisode = await tryDownloadEpisode(tvShow, episode);
  if (downloadedEpisode) return sendOK(res, downloadedEpisode);
  sendError(res, 400, {
    message: `Invalid TV show '${tvShow.name}' or episode '${serialiseEpisode(
      episode
    )}', or it is already downloaded.`,
  });
});

// GET all downloaded episodes
router.ws("/downloaded-episodes/ws", (ws, req) => {
  if (!torrentClient) {
    logger.error(
      "Websocket connection established without active torrent client."
    );
    return;
  }

  lastMessageTimestamp = 0;

  ws.on("message", (msg) => {
    let evt: { type: string; data: any };

    try {
      evt = JSON.parse(msg.toString());
    } catch (error) {
      logger.error(`Could not parse websocket message '${msg}'. ${error}`);
      return;
    }

    /** The callback to call after a message event which should resolve to the data to be sent back. */
    let action: (data: any) => Promise<any>;

    let delayMultiplier = 1;

    switch (evt.type) {
      case "poll":
        action = () => torrentClient.getAllTorrentInfos();
        const torrents = evt.data as ConvertedTorrentInfo[];
        // Enable longer response times if all downloads are complete
        if (torrents && Array.isArray(torrents)) {
          if (
            !torrents.find(
              (torrent) => torrent.status !== DownloadStatus.COMPLETE
            )
          )
            delayMultiplier = 20;
        } else {
          logger.warn(
            `Received invalid data argument for poll message: '${torrents}'.`
          );
          delayMultiplier = 5;
        }
        break;
      default:
        logger.warn(
          `Unknown message type '${evt.type}' received in websocket connection.`
        );
        return;
    }

    const currentTimestamp = new Date().getTime();
    const ping = Math.max(0, currentTimestamp - lastMessageTimestamp);
    const delayMs = Math.max(
      0,
      WS_MESSAGE_INTERVAL_MS * delayMultiplier - ping
    );
    lastMessageTimestamp = currentTimestamp + delayMs;
    //logger.debug(`Sending message in ${delayMs / 1000} s`);
    const currentTimeout = +global.setTimeout(nextMessageCallback, delayMs);
    currentTimeouts[currentTimeout] = nextMessageCallback;

    async function nextMessageCallback() {
      delete currentTimeouts[currentTimeout];

      let data = [];
      try {
        data = await action(evt.data);
      } catch (error) {
        logger.error(error);
      }
      const message = JSON.stringify({ data });
      ws.send(message);
    }
  });
});
