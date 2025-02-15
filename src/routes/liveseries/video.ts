import express from "express";
import { sendFileStream } from "guzek-uk-common/lib/http";
import {
  handleTorrentRequest,
  searchForDownloadedEpisode,
} from "../../liveseries";
import { TORRENT_DOWNLOAD_PATH } from "../../config";
import { getLogger } from "guzek-uk-common/lib/logger";

export const router = express.Router();

const logger = getLogger(__filename);

router.get("/:showName/:season/:episode", (req, res) =>
  handleTorrentRequest(
    req,
    res,
    (torrent) =>
      sendFileStream(req, res, TORRENT_DOWNLOAD_PATH + torrent.name, "mp4"),
    async (episode) => {
      const filename = await searchForDownloadedEpisode(
        res,
        episode,
        !!req.query.allow_non_mp4
      );
      logger.info(`Backup video search result: '${filename}'`);
      if (!filename) return;
      sendFileStream(req, res, filename);
    }
  )
);
