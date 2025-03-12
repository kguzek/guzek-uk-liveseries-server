import { ObjectEncodingOptions } from "fs";
import { readdir } from "fs/promises";
import path, { basename } from "path";
import type { Context, Static } from "elysia";

import type { episodeSchema } from "./schemas";
import type { Episode } from "./types";
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

/**
 * Searches the downloads folder for a filename which matches the episode.
 * The episode's show name must be sanitised before calling this function.
 * @param ctx The Elysia context
 * @param episode The episode to search for
 * @param allowAllVideoFiletypes Whether to allow all video filetypes, or only `.mp4`
 * @returns an error object or the episode file handle, guaranteed to exist on the filesystem
 */
export async function searchForDownloadedEpisode(
  ctx: Pick<Context, "set">,
  episode: Episode,
  allowAllVideoFiletypes = false,
) {
  const serialized = `${episode.showName} ${serialiseEpisode(episode)}`;
  const search = parseFilename(serialized);
  logger.debug(`Searching for downloaded episode: '${search}'...`);
  let files: string[];
  try {
    files = await readdir(path.resolve(TORRENT_DOWNLOAD_PATH), RECURSIVE_READ_OPTIONS);
  } catch (error) {
    logger.error("Error loading downloaded episodes:", error);
    ctx.set.status = 500;
    return {
      error: {
        message: "Could not load the downloaded episodes.",
      },
    };
  }
  const match = files.find(
    (file) =>
      parseFilename(basename(file)).startsWith(search) &&
      getVideoExtension(file) != null &&
      (allowAllVideoFiletypes || file.endsWith(".mp4")),
  );
  const filename = TORRENT_DOWNLOAD_PATH + match;
  if (match) {
    const file = Bun.file(filename);
    if (await file.exists()) {
      return { file };
    }
    logger.warn("File in directory but not found:", filename);
  }
  ctx.set.status = 404;
  return {
    error: {
      message: `Episode '${serialized}' was not found in the downloads.`,
    },
  };
}

export function parseEpisodeRequest(
  ctx: Pick<Context<{ params: Static<typeof episodeSchema> }>, "params">,
) {
  const episode: Episode = ctx.params;
  episode.showName = parseFilename(episode.showName);
  return episode;
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
