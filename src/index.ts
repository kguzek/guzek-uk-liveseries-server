import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";

import { getStatusText } from "@/lib/http";
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

const VERSION = process.env.npm_package_version || "4.0.0";
const app = new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: "Guzek UK LiveSeries Server",
          version: VERSION,
          contact: {
            name: "Konrad Guzek",
            email: "konrad@guzek.uk",
            url: "https://www.guzek.uk",
          },
          description:
            "The decentralised LiveSeries server for storing and streaming your favourite TV shows.",
          license: {
            name: "AGPL-3.0",
            url: "https://www.gnu.org/licenses/agpl-3.0.html#license-text",
          },
        },
      },
    }),
  )
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
  .listen(process.env.APP_PORT || 5017);

logger.http(
  `🦊 LiveSeries Server ${VERSION} is running on ${app.server?.hostname}:${app.server?.port}`,
);

initialiseSubtitleClient();
initialiseTorrentClient();
