import { Request, Response } from "express";
import fs from "fs/promises";
import { getLogger } from "guzek-uk-common/lib/logger";
import { BasicEpisode, TorrentInfo } from "guzek-uk-common/models";
import { sanitiseShowName } from "guzek-uk-common/lib/sequelize";
import {
  getVideoExtension,
  serialiseEpisode,
  validateNaturalNumber,
} from "guzek-uk-common/lib/util";
import { sendError } from "guzek-uk-common/lib/http";
import { TORRENT_DOWNLOAD_PATH } from "./config";
import { TorrentClient } from "./torrentClient";
import { ObjectEncodingOptions } from "fs";
import { basename } from "path";

const logger = getLogger(__filename);

// For some reason TypeScript doesn't recognise the `recursive` option provided in the fs docs
const RECURSIVE_READ_OPTIONS = {
  encoding: "utf-8",
  recursive: true,
} as ObjectEncodingOptions;

/** Converts periods and plus symbols into spaces, removes `:/` sequences, and turns to lowercase. */
const parseFilename = (filename: string) =>
  sanitiseShowName(filename).toLowerCase();

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
  res: Response,
  episode: BasicEpisode,
  allowAllVideoFiletypes = false,
) {
  const search = parseFilename(
    `${episode.showName} ${serialiseEpisode(episode)}`,
  );
  logger.debug(`Searching for downloaded episode: '${search}'...`);
  let files: string[];
  try {
    files = await fs.readdir(TORRENT_DOWNLOAD_PATH, RECURSIVE_READ_OPTIONS);
  } catch (error) {
    logger.error("Error loading downloaded episodes:", error);
    return sendError(res, 500, {
      message: "Could not load the downloaded episodes.",
    });
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
  req: Request,
  res: Response,
  callback: (
    torrent: TorrentInfo,
    episode: BasicEpisode,
  ) => void | Promise<void>,
  torrentNotFoundCallback: (episode: BasicEpisode) => void | Promise<void>,
) {
  const showName = req.params.showName;
  const season = +req.params.season;
  const episode = +req.params.episode;
  const basicEpisode: BasicEpisode = { showName, season, episode };
  const errorMessage =
    validateNaturalNumber(season) ?? validateNaturalNumber(episode);
  if (errorMessage) return sendError(res, 400, { message: errorMessage });
  let torrent: TorrentInfo | undefined;
  try {
    torrent = await torrentClient.getTorrentInfo(basicEpisode);
  } catch (error) {
    logger.error("Could not get torrent info:", error);
    return sendError(res, 503, {
      message: "Could not obtain the current torrent list. Try again later.",
    });
  }
  basicEpisode.showName = sanitiseShowName(basicEpisode.showName);
  const serialized = `'${basicEpisode.showName} ${serialiseEpisode(
    basicEpisode,
  )}'`;
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
  return sendError(res, 404, {
    message: `Episode ${serialized} was not found in the downloads.`,
  });
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
