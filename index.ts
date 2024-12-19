import express from "express";
import expressWs from "express-ws";
import { setupEnvironment } from "guzek-uk-common/setup";
setupEnvironment(true);
import { startServer } from "guzek-uk-common/util";
import { getLogger } from "guzek-uk-common/logger";
import { getMiddleware } from "guzek-uk-common/middleware";
import { whitelistMiddleware } from "./src/middleware/whitelist";
import { initialiseTorrentClient } from "./src/liveseries";

const logger = getLogger(__filename);

// Initialise the application instance
export const wsInstance = expressWs(express());
const app = wsInstance.app;

// Determine the server port
const PORT = process.env.NODE_PORT;

// Define the endpoints
const ENDPOINTS = [
  "liveseries/downloaded-episodes",
  "liveseries/subtitles",
  "liveseries/video",
  "torrents",
];

/** Initialises the HTTP RESTful API server. */
async function initialise() {
  app.set("trust proxy", 1);
  app.use(getMiddleware());
  app.use(whitelistMiddleware);

  // Enable individual API routes
  for (const endpoint of ENDPOINTS) {
    const middleware = await import("./src/routes/" + endpoint);
    if (middleware.init) middleware.init(ENDPOINTS);
    app.use("/" + endpoint, middleware.router);
  }

  startServer(app, PORT);
  initialiseTorrentClient();
}

if (PORT) {
  initialise();
} else {
  logger.error("No server port environment variable set.");
}
