import fs from "fs/promises";
import type { Context } from "elysia";
import { Elysia } from "elysia";

import type { Episode } from "../../lib/types";
import { STATIC_CACHE_DURATION_MINS, TORRENT_DOWNLOAD_PATH } from "../../lib/constants";
import { setCacheControl } from "../../lib/http";
import { handleTorrentRequest, searchForDownloadedEpisode } from "../../lib/liveseries";
import {
  downloadSubtitles,
  getSubtitleClient,
  SUBTITLES_DEFAULT_LANGUAGE,
} from "../../lib/subtitles";

const SUBTITLES_PATH = "/var/cache/guzek-uk/subtitles";
const SUBTITLES_FILENAME = "subtitles.vtt";
/** If set to `true`, doesn't use locally downloaded subtitles file. */
const SUBTITLES_FORCE_DOWNLOAD_NEW = false;

async function getSubtitles(ctx: Context, episode: Episode, filename: string) {
  const directory = `${SUBTITLES_PATH}/${episode.showName}/${episode.season}/${episode.episode}`;
  const filepath = `${directory}/${SUBTITLES_FILENAME}`;
  try {
    await fs.access(filepath);
    if (process.env.SUBTITLES_API_KEY_DEV && SUBTITLES_FORCE_DOWNLOAD_NEW) {
      throw new Error("Force fresh download of subtitles");
    }
  } catch (error) {
    const language = `${ctx.query.lang || SUBTITLES_DEFAULT_LANGUAGE}`.toLowerCase();
    const errorMessage = await downloadSubtitles(
      directory,
      filepath,
      filename,
      episode,
      language,
    );
    if (errorMessage) {
      ctx.set.status = 400;
      return { message: errorMessage };
    }
  }
  setCacheControl(ctx, STATIC_CACHE_DURATION_MINS);
  res.status(200).sendFile(filepath);
  // logResponse(ctx, `${getStatusText(200)} (${SUBTITLES_FILENAME})`);
}

export const subtitlesRouter = new Elysia().get("/:showName/:season/:episode", (ctx) =>
  handleTorrentRequest(
    ctx,
    (torrent, episode) => getSubtitles(ctx, episode, torrent.name),
    async (episode) => {
      const filename = await searchForDownloadedEpisode(ctx, episode);
      if (!filename) return;
      getSubtitles(ctx, episode, filename.replace(TORRENT_DOWNLOAD_PATH, ""));
    },
  ),
);

export function init() {
  getSubtitleClient();
}
