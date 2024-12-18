import express from "express";
import fs from "fs/promises";
import { getLogger } from "guzek-uk-common/logger";
import { TORRENT_DOWNLOAD_PATH } from "guzek-uk-common/models";
import { DownloadedEpisode } from "guzek-uk-common/sequelize";
import { sendError, sendFileStream, sendOK } from "guzek-uk-common/util";
import {
  handleTorrentRequest,
  searchForDownloadedEpisode,
  torrentClient,
} from "../../util";
import { sendWebsocketMessage } from "./downloaded-episodes";

export const router = express.Router();
const logger = getLogger(__filename);

router.get("/:showName/:season/:episode", (req, res) =>
  handleTorrentRequest(
    req,
    res,
    (torrent) => sendFileStream(req, res, TORRENT_DOWNLOAD_PATH + torrent.name),

    async (episode) => {
      const filename = await searchForDownloadedEpisode(res, episode);
      if (!filename) return;
      sendFileStream(req, res, filename);
    }
  )
);

router.delete("/:showName/:season/:episode", (req, res) =>
  handleTorrentRequest(req, res, async (torrent, episode) => {
    try {
      await DownloadedEpisode.destroy({ where: { episode } });
    } catch (error) {
      logger.error(error);
      return sendError(res, 500, {
        message: "Could not delete the episode from the database.",
      });
    }
    try {
      await torrentClient.removeTorrent(torrent);
    } catch (error) {
      logger.error(error);
      return sendError(res, 500, {
        message: `An unknown error occured while removing the torrent. The database entry was removed.`,
      });
    }
    sendWebsocketMessage();

    try {
      await fs.rm(TORRENT_DOWNLOAD_PATH + torrent.name, { recursive: true });
    } catch (error) {
      logger.error(error);
      return sendError(res, 500, {
        message: `An unknown error occurred while removing the files. The torrent and database entry were removed.`,
      });
    }

    sendOK(res);
  })
);
