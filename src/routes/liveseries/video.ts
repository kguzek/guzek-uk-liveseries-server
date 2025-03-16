import Elysia, { t } from "elysia";

import { EPISODE_EXAMPLE, STATIC_CACHE_DURATION_MINS } from "@/lib/constants";
import { setCacheControl } from "@/lib/http";
import {
  ERROR_MESSAGES,
  parseEpisodeRequest,
  searchForDownloadedEpisode,
} from "@/lib/liveseries";
import { episodeSchema, messageSchema } from "@/lib/schemas";

export const videoRouter = new Elysia({ prefix: "/liveseries/video" }).get(
  "/:showName/:season/:episode",
  async function (ctx) {
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
    }),
    response: {
      500: messageSchema(500, ERROR_MESSAGES.directoryAccessError),
      404: messageSchema(404, ERROR_MESSAGES.episodeNotFound(EPISODE_EXAMPLE)),
      200: t.File(),
    },
  },
);
