import Elysia, { t } from "elysia";

import type { Episode, SearchResult } from "@/lib/types";
import { getLogger } from "@/lib/logger";
import {
  accessTokenSchema,
  episodeSchema,
  messageSchema,
  searchResultSchema,
} from "@/lib/schemas";
import { TorrentIndexer } from "@/torrent-indexers";
import { Eztv } from "@/torrent-indexers/eztv";

const logger = getLogger(__filename);
const indexer: TorrentIndexer = new Eztv();

const NOT_FOUND_MESSAGE = "No torrents found for this episode.";
const ERROR_SEARCHING_MESSAGE = "Could not obtain torrent data.";

export const torrentsRouter = new Elysia().get(
  "/torrents/:showName/:season/:episode",
  async (ctx) => {
    const { params, query, set } = ctx;
    const showName = params.showName;
    const season = +params.season;
    const episode = +params.episode;
    const selectTopResult = query.select === "top_result";
    const episodeObject: Episode = { showName, season, episode };

    let results: SearchResult[] = [];
    try {
      results = await indexer.search(episodeObject);
    } catch (error) {
      logger.error("Error searching for episode:", error);
      set.status = 500;
      return {
        message: ERROR_SEARCHING_MESSAGE,
      };
    }
    if (results.length === 0) {
      set.status = 404;
      return {
        message: NOT_FOUND_MESSAGE,
      };
    }
    if (selectTopResult) {
      // `null` is only returned if the array is empty, which has been checked already
      return indexer.selectTopResult(results)!;
    }
    const sortAscending =
      typeof query.sort_direction === "string" &&
      ["asc", "ascending"].includes(query.sort_direction);
    if (query.sort_by) {
      const key = query.sort_by;
      results = results.sort((a, b) => {
        let valueA = a[key] || 0;
        let valueB = b[key] || 0;
        const comparison =
          typeof valueA === "string"
            ? valueA.localeCompare(`${valueB}`)
            : typeof valueB === "string"
              ? `${valueA}`.localeCompare(valueB)
              : valueA - valueB;
        return sortAscending ? comparison : -comparison;
      });
    }
    return results;
  },
  {
    params: episodeSchema,
    query: t.Object({
      select: t.ReadonlyOptional(t.Literal("top_result")),
      sort_by: t.ReadonlyOptional(
        t.Union([
          t.Literal("link"),
          t.Literal("name"),
          t.Literal("age"),
          t.Literal("type"),
          t.Literal("files"),
          t.Literal("size"),
          t.Literal("sizeHuman"),
          t.Literal("seeders"),
          t.Literal("leechers"),
        ]),
      ),
      sort_direction: t.ReadonlyOptional(
        t.Union([
          t.Literal("asc"),
          t.Literal("ascending"),
          t.Literal("desc"),
          t.Literal("descending"),
        ]),
      ),
      ...accessTokenSchema.properties,
    }),
    response: {
      200: t.Union([searchResultSchema, t.Array(searchResultSchema)]),
      404: messageSchema(404, NOT_FOUND_MESSAGE),
      500: messageSchema(500, ERROR_SEARCHING_MESSAGE),
    },
  },
);
