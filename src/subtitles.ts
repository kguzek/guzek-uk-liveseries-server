import fs from "fs/promises";
import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import { createWriteStream, fsync } from "fs";
import { getLogger } from "guzek-uk-common/logger";
import { BasicEpisode, TorrentInfo } from "guzek-uk-common/models";
import { serialiseEpisode } from "guzek-uk-common/util";

const SUBTITLES_API_URL = "https://api.opensubtitles.com/api/v1";
export const SUBTITLES_DEFAULT_LANGUAGE = "en";

const logger = getLogger(__filename);

let subtitleClient: AxiosInstance | null = null;

export async function getSubtitleClient() {
  const headers = {
    "User-Agent": "Guzek UK LiveSeries API v1.0.0",
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
      "No SUBTITLES_API_KEY, SUBTITLES_API_USER or SUBTITLES_API_PASSWORD environment variable set"
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
      { headers }
    );
  } catch (error) {
    logger.error(error);
    error instanceof AxiosError && logger.debug(error.response?.data);
    logger.error("Could not reach the OpenSubtitles API");
    return;
  }
  const data = res.data as any;
  if (!data?.base_url || !data.token) {
    logger.error("Invalid OpenSubtitles API response");
    logger.debug(data);
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
  logger.debug(data.user);
}

export async function downloadSubtitles(
  directory: string,
  filepath: string,
  filename: string,
  episode: BasicEpisode,
  language: string
): Promise<string> {
  if (!subtitleClient)
    return "Subtitles are currently unavailable. Try again later.";

  let res: AxiosResponse;
  // Get the substring up until the first slash or opening square bracket, exclusive
  // E.g. "The Simpsons [720p]/The Simpsons S01E01" -> "The Simpsons"
  const query = filename.replace(/[\/\\\[].+$/, "").trim();
  if (!query) {
    logger.error(`Invalid torrent filename '${filename}'.`);
    return "It looks like subtitles for this TV show are unavailable.";
  }
  logger.info(`Searching for subtitles '${query}'...`);
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
    logger.error(error);
    error instanceof AxiosError && logger.debug(error.response?.data);
    return "The subtitle service is temporarily unavailable.";
  }
  const data = res?.data as any;
  const resultCount = data?.total_count;
  const results = data?.data as any[];
  if (!Array.isArray(results)) {
    logger.error("Received malformatted response from OpenSubtitles");
    logger.debug(res.data);
    return "Subtitles for this episode are temporarily unavailable.";
  }
  if (!resultCount || !results?.length) {
    return "There are no subtitles for this episode.";
  }
  const sorted = results.sort(
    (a, b) => b.attributes.download_count - a.attributes.download_count
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
    [[], []]
  );
  // Ensure the close matches are prioritised, but don't throw away the 'far' matches if no close ones have the queried language
  const matches = [...closeMatches, ...farMatches];
  const result =
    matches.find((result) => result.attributes.language === language) ??
    // None of the matches have the right language, so send the default language (English)
    matches.find(
      (result) => result.attributes.language === SUBTITLES_DEFAULT_LANGUAGE
    ) ??
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
    logger.error(error);
    error instanceof AxiosError && logger.debug(error.response?.data);
    return "Subtitles for this episode were found but could not be downloaded. Try again later.";
  }
  const url = res.data.link;
  if (!url) {
    return "Subtitles for this episode were found but malformatted. Try again later.";
  }
  try {
    res = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });
  } catch (error) {
    logger.error(error);
    return "Downloading the subtitles failed. Try again later.";
  }
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (error) {
    logger.error(error);
    return "Could not save the subtitles to the server.";
  }
  const writer = createWriteStream(filepath);
  return new Promise((resolve) => {
    res.data.pipe(writer);
    let errorMessage = "";
    writer.on("error", (error) => {
      logger.error(error);
      errorMessage = "Could not save the subtitle file.";
      writer.close();
    });
    writer.on("close", () => {
      resolve(errorMessage);
    });
  });
}
