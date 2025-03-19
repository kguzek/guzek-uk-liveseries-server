import { basename } from "path";
import Elysia, { t } from "elysia";

import {
  EPISODE_EXAMPLE,
  STATIC_CACHE_DURATION_MINS,
  TORRENT_DOWNLOAD_PATH,
} from "@/lib/constants";
import { setCacheControl } from "@/lib/http";
import {
  ERROR_MESSAGES,
  parseEpisodeRequest,
  searchForDownloadedEpisode,
} from "@/lib/liveseries";
import { accessTokenSchema, episodeSchema, messageSchema } from "@/lib/schemas";

const STAT_SUCCESS_MESSAGE = "Episode found successfully.";

export const videoRouter = new Elysia({ prefix: "/liveseries" })
  .get(
    "/video/:showName/:season/:episode",
    async (ctx) => {
      const episode = parseEpisodeRequest(ctx);
      const result = await searchForDownloadedEpisode(
        ctx,
        episode,
        ctx.query.allow_non_mp4,
      );
      if (result.error == null) {
        setCacheControl(ctx, STATIC_CACHE_DURATION_MINS);
        return result.file;
      }
      return result.error;
    },
    {
      params: episodeSchema,
      query: t.Object({
        allow_non_mp4: t.Optional(t.Boolean()),
        ...accessTokenSchema.properties,
      }),
      response: {
        500: messageSchema(500, ERROR_MESSAGES.directoryAccessError),
        404: messageSchema(404, ERROR_MESSAGES.episodeNotFound(EPISODE_EXAMPLE)),
        200: t.File(),
      },
    },
  )
  .get(
    "/stat/:showName/:season/:episode",
    async (ctx) => {
      const episode = parseEpisodeRequest(ctx);
      const result = await searchForDownloadedEpisode(ctx, episode);
      return (
        result.error ?? {
          message: STAT_SUCCESS_MESSAGE,
          path: result.file.name,
          filename: basename(result.file.name ?? ""),
          size: result.file.size,
        }
      );
    },
    {
      params: episodeSchema,
      response: {
        500: messageSchema(500, ERROR_MESSAGES.directoryAccessError),
        404: messageSchema(404, ERROR_MESSAGES.episodeNotFound(EPISODE_EXAMPLE)),
        200: t.Object({
          ...messageSchema(200, STAT_SUCCESS_MESSAGE).properties,
          path: t.String({ examples: [`${EPISODE_EXAMPLE}.mkv.mp4`] }),
          filename: t.String({
            examples: [`${TORRENT_DOWNLOAD_PATH}/${EPISODE_EXAMPLE}.mkv.mp4`],
          }),
          size: t.Number({ examples: [Math.floor(Math.random() * 10000) + 10000] }),
        }),
      },
    },
  );
