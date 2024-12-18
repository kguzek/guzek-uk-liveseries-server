import express from "express";
import { getLogger } from "guzek-uk-common/logger";
import { BasicEpisode } from "guzek-uk-common/models";
import { Eztv } from "../torrentIndexers/eztv";
import {
  SearchResult,
  TorrentIndexer,
} from "../torrentIndexers/torrentIndexer";
import { sendError, sendOK, validateNaturalNumber } from "guzek-uk-common/util";

export const router = express.Router();
const indexer: TorrentIndexer = new Eztv();

const logger = getLogger(__filename);

function isResultKey(result: SearchResult, k: any): k is keyof SearchResult {
  const key = k as keyof SearchResult;
  const value = result[key];
  return (
    typeof key === "string" &&
    key in result &&
    value != null &&
    ["string", "number"].includes(typeof value)
  );
}

// Searches for torrents at /torrents/[tv-show]/[season]/[episode]
router.get("/:showName/:season/:episode", async (req, res) => {
  const showName = req.params.showName;
  const season = +req.params.season;
  const episode = +req.params.episode;
  const selectTopResult = req.query.select === "top_result";
  const basicEpisode: BasicEpisode = { showName, season, episode };
  const errorMessage =
    validateNaturalNumber(season) ?? validateNaturalNumber(episode);
  if (errorMessage) return sendError(res, 400, { message: errorMessage });

  let results: SearchResult[] = [];
  try {
    results = await indexer.search(basicEpisode);
  } catch (error) {
    logger.error(error);
    sendError(res, 500, { message: "Could not obtain torrent data." });
  }
  if (selectTopResult) {
    if (results.length === 0) {
      return sendError(res, 404, {
        message: "No torrents found for this episode.",
      });
    }
    const topResult = indexer.selectTopResult(results);
    return sendOK(res, topResult);
  }
  const sortBy = req.query.sort_by;
  if (results.every((result) => isResultKey(result, sortBy))) {
    const key = sortBy as keyof SearchResult;
    const sortAscending =
      typeof req.query.sort_direction === "string" &&
      ["asc", "ascending"].includes(req.query.sort_direction);
    results = results.sort((a, b) => {
      const k = key as keyof SearchResult;
      let valueA = a[k] as string | number;
      let valueB = b[k] as string | number;
      const comparison =
        typeof valueA === "string"
          ? valueA.localeCompare(`${valueB}`)
          : typeof valueB === "string"
          ? `${valueA}`.localeCompare(valueB)
          : valueA - valueB;
      return sortAscending ? comparison : -comparison;
    });
  }
  sendOK(res, results);
});

export default router;
