import express from "express";
import { sendFileStream } from "guzek-uk-common/util";
import {
  handleTorrentRequest,
  searchForDownloadedEpisode,
} from "../../liveseries";
import { TORRENT_DOWNLOAD_PATH } from "../../config";

export const router = express.Router();

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
