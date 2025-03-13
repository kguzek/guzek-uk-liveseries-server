import { join, resolve } from "path";
import { Elysia, t } from "elysia";

import { STATIC_CACHE_DURATION_MINS } from "@/lib/constants";
import { setCacheControl } from "@/lib/http";
import { parseEpisodeRequest } from "@/lib/liveseries";
import { episodeSchema, messageSchema } from "@/lib/schemas";
import {
  downloadSubtitles,
  ERROR_MESSAGES,
  getSubtitleFile,
  SUBTITLES_DEFAULT_LANGUAGE,
} from "@/lib/subtitles";

const SUBTITLES_PATH = resolve(
  process.env.SUBTITLE_CACHE_PATH || "/var/cache/guzek-uk/subtitles",
);
const SUBTITLES_FILENAME = "subtitles.vtt";
/** If set to `true`, doesn't use locally downloaded subtitles file. */
const SUBTITLES_FORCE_DOWNLOAD_NEW = false;

export const subtitlesRouter = new Elysia({ prefix: "/liveseries/subtitles" }).get(
  "/:showName/:season/:episode",
  async (ctx) => {
    const episode = parseEpisodeRequest(ctx);
    const directory = join(
      SUBTITLES_PATH,
      episode.showName,
      episode.season.toString(),
      episode.episode.toString(),
    );
    const filepath = join(directory, SUBTITLES_FILENAME);
    const forceDownload =
      process.env.SUBTITLES_API_KEY_DEV && SUBTITLES_FORCE_DOWNLOAD_NEW;
    const file = getSubtitleFile(filepath);
    if (!forceDownload && (await file.exists())) {
      setCacheControl(ctx, STATIC_CACHE_DURATION_MINS);
      return file;
    }
    const language = SUBTITLES_DEFAULT_LANGUAGE;
    return await downloadSubtitles(ctx, directory, filepath, episode, language);
  },
  {
    params: episodeSchema,
    response: {
      200: t.File(),
      404: messageSchema(ERROR_MESSAGES.subtitlesNotFound),
      500: messageSchema(
        ERROR_MESSAGES.subtitleClientNotConfigured,
        ERROR_MESSAGES.subtitleServiceBadResponse,
        ERROR_MESSAGES.subtitlesMalformatted,
        ERROR_MESSAGES.subtitleServiceDownloadError,
        ERROR_MESSAGES.subtitleClientMalformattedResponse,
        ERROR_MESSAGES.subtitleServiceDownloadError2,
        ERROR_MESSAGES.directoryAccessError,
      ),
      503: messageSchema(ERROR_MESSAGES.subtitleServiceNotReachable),
    },
  },
);
