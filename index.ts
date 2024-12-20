import express from "express";
import expressWs from "express-ws";
import { setupEnvironment } from "guzek-uk-common/setup";
const DEBUG_MODE = setupEnvironment(true);
import { getServerPort, startServer } from "guzek-uk-common/util";
import { getMiddleware } from "guzek-uk-common/middleware";
import { getWhitelistMiddleware } from "./src/middleware/whitelist";
import { initialiseTorrentClient } from "./src/liveseries";

// Initialise the application instance
export const wsInstance = expressWs(express());
const app = wsInstance.app;

// Define the endpoints
const ENDPOINTS = [
  "liveseries/downloaded-episodes",
  "liveseries/subtitles",
  "liveseries/video",
  "torrents",
];

/** Initialises the HTTP RESTful API server. */
async function initialise() {
  const port = getServerPort();
  if (!port) return;

  app.set("trust proxy", 1);
  app.use(getMiddleware());
  app.use(getWhitelistMiddleware(DEBUG_MODE));

  // Enable individual API routes
  for (const endpoint of ENDPOINTS) {
    const middleware = await import("./src/routes/" + endpoint);
    if (middleware.init) middleware.init(ENDPOINTS);
    app.use("/" + endpoint, middleware.router);
  }

  startServer(app, port);
  initialiseTorrentClient();
}

initialise();
