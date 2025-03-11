import { ObjectEncodingOptions } from "fs";
import fs from "fs/promises";
import { basename } from "path";
import type { Context } from "elysia";

import type { Episode, TorrentInfo } from "./types";
import { TORRENT_DOWNLOAD_PATH } from "./constants";
import { getVideoExtension } from "./http";
import { getLogger } from "./logger";
import { TorrentClient } from "./torrent-client";

const logger = getLogger(__filename);

// For some reason TypeScript doesn't recognise the `recursive` option provided in the fs docs
const RECURSIVE_READ_OPTIONS = {
  encoding: "utf-8",
  recursive: true,
} as ObjectEncodingOptions;

export const serialiseEpisode = (episode: Pick<Episode, "season" | "episode">) =>
  "S" +
  `${episode.season}`.padStart(2, "0") +
  "E" +
  `${episode.episode}`.padStart(2, "0");

/** Converts periods and plus symbols into spaces, and removes `:/` sequences. */
export const sanitiseShowName = (showName: string) =>
  showName.replace(/[.+]/g, " ").replace(/:\//g, "").trim();

/** Converts periods and plus symbols into spaces, removes `:/` sequences, and turns to lowercase. */
const parseFilename = (filename: string) => sanitiseShowName(filename).toLowerCase();

export let torrentClient: TorrentClient;

/** Returns a 404 response to the client when thrown within a `handleTorrentRequest` callback. */
export class EpisodeNotFoundError extends Error {}

/**
 * Searches the downloads folder for a filename which matches the episode.
 * The episode's show name must be sanitised before calling this function.
 * Sends a 500 response if the folder could not be read.
 * Throws an `Error` if the episode is not found, which must be handled.
 * @param res The response object
 * @param episode The episode to search for
 * @param allowAllVideoFiletypes Whether to allow all video filetypes, or only `.mp4`
 */
export async function searchForDownloadedEpisode(
  ctx: Context,
  episode: Episode,
  allowAllVideoFiletypes = false,
) {
  const search = parseFilename(`${episode.showName} ${serialiseEpisode(episode)}`);
  logger.debug(`Searching for downloaded episode: '${search}'...`);
  let files: string[];
  try {
    files = await fs.readdir(TORRENT_DOWNLOAD_PATH, RECURSIVE_READ_OPTIONS);
  } catch (error) {
    logger.error("Error loading downloaded episodes:", error);
    ctx.set.status = 500;
    return {
      message: "Could not load the downloaded episodes.",
    };
  }
  const match = files.find(
    (file) =>
      parseFilename(basename(file)).startsWith(search) &&
      getVideoExtension(file) != null &&
      (allowAllVideoFiletypes || file.endsWith(".mp4")),
  );
  if (match) return TORRENT_DOWNLOAD_PATH + match;
  throw new EpisodeNotFoundError();
}

/**
 * Parses the requested torrent from the request object and either calls the callback with
 * information related to the torrent, or sends an error response if the torrent is not found.
 */
export async function handleTorrentRequest(
  ctx: Context,
  callback: (torrent: TorrentInfo, episode: Episode) => void | Promise<void>,
  torrentNotFoundCallback: (episode: Episode) => void | Promise<void>,
) {
  const showName = ctx.params.showName;
  const season = +ctx.params.season;
  const episode = +ctx.params.episode;
  const basicEpisode: Episode = { showName, season, episode };
  let torrent: TorrentInfo | undefined;
  try {
    torrent = await torrentClient.getTorrentInfo(basicEpisode);
  } catch (error) {
    logger.error("Could not get torrent info:", error);
    ctx.set.status = 503;
    return {
      message: "Could not obtain the current torrent list. Try again later.",
    };
  }
  basicEpisode.showName = sanitiseShowName(basicEpisode.showName);
  const serialized = `'${basicEpisode.showName} ${serialiseEpisode(basicEpisode)}'`;
  if (torrent) {
    try {
      await callback(torrent, basicEpisode);
      return;
    } catch (error) {
      if (!(error instanceof EpisodeNotFoundError)) throw error;
    }
  } else {
    logger.debug(`Torrent not found: ${serialized}`);
  }
  try {
    await torrentNotFoundCallback(basicEpisode);
    return;
  } catch (error) {
    if (!(error instanceof EpisodeNotFoundError))
      logger.error("Error while searching for torrent:", error);
    // Continue to the 404 response
  }
  ctx.set.status = 404;
  return {
    message: `Episode ${serialized} was not found in the downloads.`,
  };
}

export async function initialiseTorrentClient() {
  torrentClient = new TorrentClient();
  try {
    await torrentClient.waitForInitialisation();
  } catch (error) {
    logger.error("Initialisation failure:", error);
    logger.warn(
      "Ensure that your transmission client is running and that the configuration of `.env` is correct.",
    );
    logger.warn(
      "The server is operational, but torrent-related requests will fail with HTTP status 503.",
    );
    return;
  }
  if (!torrentClient) {
    logger.error("Failed to initialise the torrent client.");
    return;
  }
  logger.info("Torrent client initialised successfully.");
}
