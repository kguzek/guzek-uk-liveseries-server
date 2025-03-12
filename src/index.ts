import { swagger } from "@elysiajs/swagger";
import { file } from "bun";
import { Elysia } from "elysia";

import { getStatusText, setCacheControl } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { logRequest, logResponse } from "@/middleware/logging";
import { healthRouter } from "@/routes/health";
import { subtitlesRouter } from "@/routes/liveseries/subtitles";
import { videoRouter } from "@/routes/liveseries/video";
import { torrentsRouter } from "@/routes/torrents";

import { initialiseTorrentClient } from "./lib/liveseries";
import { initialiseSubtitleClient } from "./lib/subtitles";
import { downloadedEpisodesRouter } from "./routes/liveseries/downloaded-episodes";
import { staticRouter } from "./routes/static";

const logger = getLogger(__filename);

const app = new Elysia()
  .use(swagger())
  .onBeforeHandle(logRequest)
  .onAfterResponse(logResponse)
  .onError((ctx) => {
    if (ctx.code === "NOT_FOUND") {
      ctx.set.status = 404;
      logRequest(ctx);
      logResponse(ctx);
      return { message: getStatusText(ctx.set.status) };
    }
    if (ctx.code === "VALIDATION") return;
    ctx.set.status = 500;
    return {
      message: getStatusText(ctx.set.status),
      error: ctx.error instanceof Error ? ctx.error.message : null,
    };
  })
  .use(healthRouter)
  .use(staticRouter)
  .use(torrentsRouter)
  .use(subtitlesRouter)
  .use(videoRouter)
  .use(downloadedEpisodesRouter)
  .listen(3000);

logger.http(
  `🦊 LiveSeries Server is running on ${app.server?.hostname}:${app.server?.port}`,
);

initialiseSubtitleClient();
initialiseTorrentClient();
