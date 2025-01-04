import express, { Request, Response } from "express";

import fs from "fs/promises";
import {
  BasicEpisode,
  STATIC_CACHE_DURATION_MINS,
} from "guzek-uk-common/models";
import {
  downloadSubtitles,
  getSubtitleClient,
  SUBTITLES_DEFAULT_LANGUAGE,
} from "../../subtitles";
import {
  getStatusText,
  logResponse,
  sendError,
  setCacheControl,
} from "guzek-uk-common/util";
import {
  handleTorrentRequest,
  searchForDownloadedEpisode,
} from "../../liveseries";
import { TORRENT_DOWNLOAD_PATH } from "../../config";

export const router = express.Router();

const SUBTITLES_PATH = "/var/cache/guzek-uk/subtitles";
const SUBTITLES_FILENAME = "subtitles.vtt";
/** If set to `true`, doesn't use locally downloaded subtitles file. */
const SUBTITLES_FORCE_DOWNLOAD_NEW = false;

async function getSubtitles(
  req: Request,
  res: Response,
  episode: BasicEpisode,
  filename: string
) {
  const directory = `${SUBTITLES_PATH}/${episode.showName}/${episode.season}/${episode.episode}`;
  const filepath = `${directory}/${SUBTITLES_FILENAME}`;
  try {
    await fs.access(filepath);
    if (process.env.SUBTITLES_API_KEY_DEV && SUBTITLES_FORCE_DOWNLOAD_NEW) {
      throw new Error("Force fresh download of subtitles");
    }
  } catch (error) {
    const language = `${
      req.query.lang || SUBTITLES_DEFAULT_LANGUAGE
    }`.toLowerCase();
    const errorMessage = await downloadSubtitles(
      directory,
      filepath,
      filename,
      episode,
      language
    );
    if (errorMessage) {
      sendError(res, 400, { message: errorMessage });
      return;
    }
  }
  setCacheControl(res, STATIC_CACHE_DURATION_MINS);
  res.status(200).sendFile(filepath);
  logResponse(res, `${getStatusText(200)} (${SUBTITLES_FILENAME})`);
}

router.get("/:showName/:season/:episode", (req, res) =>
  handleTorrentRequest(
    req,
    res,
    (torrent, episode) => getSubtitles(req, res, episode, torrent.name),
    async (episode) => {
      const filename = await searchForDownloadedEpisode(res, episode);
      if (!filename) return;
      getSubtitles(
        req,
        res,
        episode,
        filename.replace(TORRENT_DOWNLOAD_PATH, "")
      );
    }
  )
);

export function init() {
  getSubtitleClient();
}
