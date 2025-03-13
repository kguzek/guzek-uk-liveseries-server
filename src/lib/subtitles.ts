import { mkdir } from "fs/promises";
import { resolve } from "path";
import type { BunFile } from "bun";
import type { Context } from "elysia";
import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";

import type { Episode } from "./types";
import { STATIC_CACHE_DURATION_MINS } from "./constants";
import { setCacheControl } from "./http";
import { serialiseEpisode } from "./liveseries";
import { getLogger } from "./logger";

const SUBTITLES_API_URL = "https://api.opensubtitles.com/api/v1";
export const SUBTITLES_DEFAULT_LANGUAGE = "en";

const logger = getLogger(__filename);

let subtitleClient: AxiosInstance | null = null;

export const getSubtitleFile = (path: string) =>
  Bun.file(resolve(path), { type: "text/vtt" });

export async function initialiseSubtitleClient() {
  const headers = {
    "User-Agent": "Guzek UK LiveSeries API v4.0.0",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const apiKeyDev = process.env.SUBTITLES_API_KEY_DEV;
  if (apiKeyDev) {
    subtitleClient = axios.create({
      baseURL: SUBTITLES_API_URL,
      headers: { ...headers, "Api-Key": apiKeyDev },
    });
    logger.debug("Logged in to OpenSubtitles API as developer");
    return;
  }
  const apiKey = process.env.SUBTITLES_API_KEY;
  const username = process.env.SUBTITLES_API_USER;
  const password = process.env.SUBTITLES_API_PASSWORD;
  if (!apiKey || !username || !password) {
    logger.error(
      "No SUBTITLES_API_KEY, SUBTITLES_API_USER or SUBTITLES_API_PASSWORD environment variable set",
    );
    return;
  }
  let res: AxiosResponse;
  try {
    res = await axios.post(
      `${SUBTITLES_API_URL}/login`,
      {
        username,
        password,
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof AxiosError) {
      logger.error(
        `Non-OK response from the OpenSubtitles API: ${error.message}`,
        error.response?.data,
      );
    } else {
      logger.error("Network error reaching the OpenSubtitles API", error);
    }
    return;
  }
  const data = res.data as any;
  if (!data?.base_url || !data.token) {
    logger.error("Invalid OpenSubtitles API response:", data);
    return;
  }
  subtitleClient = axios.create({
    baseURL: `https://${data.base_url}/api/v1`,
    headers: {
      ...headers,
      "Api-Key": apiKey,
      Authorization: `Bearer ${data.token}`,
    },
  });
  logger.info("Logged in to OpenSubtitles API");
  logger.verbose("Subtitles API user:", data.user);
}

export const ERROR_MESSAGES = {
  subtitleClientNotConfigured:
    "The subtitle service was not configured correctly. Please contact the server administrator.",
  subtitleServiceBadResponse:
    "The subtitle service returned a bad response. Please try again later.",
  subtitleServiceNotReachable: "The subtitle service is not reachable.",
  subtitlesMalformatted: "The subtitles for this request are malformatted.",
  subtitlesNotFound: "There are no subtitles for this episode.",
  subtitleServiceDownloadError:
    "Subtitles for this episode were found but could not be downloaded. Try again later.",
  subtitleClientMalformattedResponse:
    "Subtitles for this episode were found but malformatted. Try again later.",
  subtitleServiceDownloadError2: "Downloading the subtitles failed. Try again later.",
  directoryAccessError: "Could not save the subtitles to the server.",
};

export async function downloadSubtitles(
  ctx: Pick<Context, "set" | "headers">,
  directory: string,
  filepath: string,
  episode: Episode,
  language: string,
): Promise<BunFile | { message: string }> {
  function reject(message: string, code: number = 500) {
    ctx.set.status = code;
    return { message };
  }

  if (!subtitleClient) {
    return reject(ERROR_MESSAGES.subtitleClientNotConfigured);
  }

  let res: AxiosResponse;
  const query = episode.showName;
  logger.debug(`Searching for subtitles '${query} ${serialiseEpisode(episode)}'...`);
  try {
    res = await subtitleClient.get("/subtitles", {
      params: {
        query,
        type: "episode",
        season_number: episode.season,
        episode_number: episode.episode,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      logger.debug(`Non-OK subtitles response: ${error.message}`, error.response.data);
      return reject(error.message, error.response.status);
    } else {
      logger.error("Network error getting subtitles:", error);
      return reject(ERROR_MESSAGES.subtitleServiceNotReachable, 503);
    }
  }
  const data = res?.data as any;
  const resultCount = data?.total_count;
  const results = data?.data as any[];
  if (!Array.isArray(results)) {
    logger.error("Received malformatted response from OpenSubtitles", data);
    return reject(ERROR_MESSAGES.subtitlesMalformatted);
  }
  if (!resultCount || !results?.length) {
    return reject(ERROR_MESSAGES.subtitlesNotFound, 404);
  }
  const sorted = results.sort(
    (a, b) => b.attributes.download_count - a.attributes.download_count,
  );
  const [closeMatches, farMatches] = sorted.reduce(
    ([close, far], result) =>
      // The 'release' and 'comments' fields  provide torrent names that they are suitable for; these are 'close' matches
      result.attributes.comments.includes(query) ||
      result.attributes.release.includes(query)
        ? [[...close, result], far]
        : // The 'far' matches don't specify our exact torrent name, but they should be for the same show/season/episode
          // This means that there might be some synchronisation errors, which is why the 'far' results are put to the end
          [close, [...far, result]],
    [[], []],
  );
  // Ensure the close matches are prioritised, but don't throw away the 'far' matches if no close ones have the queried language
  const matches = [...closeMatches, ...farMatches];
  const result =
    matches.find((result) => result.attributes.language === language) ??
    // None of the matches have the right language, so send the default language (English)
    matches.find((result) => result.attributes.language === SUBTITLES_DEFAULT_LANGUAGE) ??
    // Maybe some foreign shows don't even have subtitles in English, so send the most downloaded file there is
    matches[0];
  const fileId = result.attributes.files[0]?.file_id;
  logger.debug(`Downloading subtitles with id '${fileId}'`);
  try {
    res = await subtitleClient.post("/download", {
      file_id: +fileId,
      file_name: `${episode.showName} ${serialiseEpisode(episode)}`,
      sub_format: "webvtt",
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.debug(
        `Non-OK response while POSTing to subtitles: ${error.message}`,
        error.response?.data,
      );
    } else {
      logger.error("Network error posting subtitles:", error);
    }
    return reject(ERROR_MESSAGES.subtitleServiceDownloadError);
  }
  const url = res.data.link;
  if (!url) {
    return reject(ERROR_MESSAGES.subtitleClientMalformattedResponse);
  }
  try {
    res = await axios({
      url,
      method: "GET",
      responseType: "arraybuffer",
    });
  } catch (error) {
    logger.error(`Requst GET ${url} failed:`, error);
    return reject(ERROR_MESSAGES.subtitleServiceDownloadError2);
  }
  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    logger.error(`Error while mkdir ${directory}:`, error);
    return reject(ERROR_MESSAGES.directoryAccessError);
  }
  const arrayBuffer: ArrayBuffer = res.data;
  const file = getSubtitleFile(filepath);
  await file.write(arrayBuffer);
  setCacheControl(ctx, STATIC_CACHE_DURATION_MINS);
  return file;
}
