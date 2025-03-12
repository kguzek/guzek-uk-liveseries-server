import { resolve } from "path";
import type { Context } from "elysia";
import { Elysia } from "elysia";

import type { Episode } from "@/lib/types";
import { STATIC_CACHE_DURATION_MINS } from "@/lib/constants";
import { setCacheControl } from "@/lib/http";
import { parseEpisodeRequest } from "@/lib/liveseries";
import { episodeSchema } from "@/lib/schemas";
import {
  downloadSubtitles,
  getSubtitleFile,
  SUBTITLES_DEFAULT_LANGUAGE,
} from "@/lib/subtitles";

const SUBTITLES_PATH = "/var/cache/guzek-uk/subtitles";
const SUBTITLES_FILENAME = "subtitles.vtt";
/** If set to `true`, doesn't use locally downloaded subtitles file. */
const SUBTITLES_FORCE_DOWNLOAD_NEW = false;

async function getSubtitles(ctx: Pick<Context, "headers" | "set">, episode: Episode) {
  const directory = `${SUBTITLES_PATH}/${episode.showName}/${episode.season}/${episode.episode}`;
  const filepath = `${directory}/${SUBTITLES_FILENAME}`;
  const file = getSubtitleFile(filepath);
  if (
    file.size === 0 ||
    (process.env.SUBTITLES_API_KEY_DEV && SUBTITLES_FORCE_DOWNLOAD_NEW)
  ) {
    const language = SUBTITLES_DEFAULT_LANGUAGE;
    return await downloadSubtitles(ctx, directory, filepath, episode, language);
  }
  setCacheControl(ctx, STATIC_CACHE_DURATION_MINS);
  return new Response(file);
}

export const subtitlesRouter = new Elysia({ prefix: "/liveseries/subtitles" }).get(
  "/:showName/:season/:episode",
  (ctx) => getSubtitles(ctx, parseEpisodeRequest(ctx)),
  { params: episodeSchema },
);
