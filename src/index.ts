import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";

import { getStatusText } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { loggingMiddleware } from "@/middleware/logging";
import { healthRouter } from "@/routes/health";
import { subtitlesRouter } from "@/routes/liveseries/subtitles";
import { videoRouter } from "@/routes/liveseries/video";
import { torrentsRouter } from "@/routes/torrents";

import { readWhitelistFile } from "./lib/auth";
import { CORS_ORIGINS } from "./lib/constants";
import { initialiseTorrentClient } from "./lib/liveseries";
import { initialiseSubtitleClient } from "./lib/subtitles";
import { whitelistMiddleware } from "./middleware/whitelist";
import { downloadedEpisodesRouter } from "./routes/liveseries/downloaded-episodes";
import { staticRouter } from "./routes/static";

const logger = getLogger(__filename);

const VERSION = process.env.npm_package_version || "4.0.0";

async function init() {
  const whitelistResult = await readWhitelistFile();
  if (whitelistResult.message) {
    logger.crit(whitelistResult.message, whitelistResult.error);
    return;
  }

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
    .use(loggingMiddleware)
    .use(whitelistMiddleware)
    .onError((ctx) => {
      if (ctx.code === "NOT_FOUND") {
        return {
          message: `Path not found '${ctx.path}'`,
          status: getStatusText(ctx.set.status),
        };
      }
      if (ctx.code === "VALIDATION") return;
      ctx.set.status = 500;
      return {
        message: "An unexpected error occurred",
        status: getStatusText(ctx.set.status),
        error: ctx.error instanceof Error ? ctx.error.message : null,
      };
    })
    .onStop(() => {
      logger.http("🦊 Stopping the server...");
    })
    .use(
      cors({ origin: CORS_ORIGINS, allowedHeaders: ["Content-Type", "Authorization"] }),
    )
    .use(
      rateLimit({
        errorResponse: new Response(
          JSON.stringify({
            message: "Too many requests, please try again later.",
            status: getStatusText(429),
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 429,
          },
        ),
      }),
    )
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
}

await init();
