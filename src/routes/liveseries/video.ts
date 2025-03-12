import Elysia, { t } from "elysia";

import { STATIC_CACHE_DURATION_MINS } from "@/lib/constants";
import { setCacheControl } from "@/lib/http";
import { parseEpisodeRequest, searchForDownloadedEpisode } from "@/lib/liveseries";
import { episodeSchema } from "@/lib/schemas";

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
  },
);
