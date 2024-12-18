/** Base torrent indexer interface and utility functions for specific services to implement. */

import axios from "axios";
import parse, { HTMLElement, Node } from "node-html-parser";
import { getLogger } from "guzek-uk-common/logger";
import { BasicEpisode } from "guzek-uk-common/models";
import { sanitiseShowName } from "guzek-uk-common/sequelize";
import { serialiseEpisode } from "guzek-uk-common/util";

const logger = getLogger(__filename);

export const SIZE_UNIT_PREFIXES = {
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
} as const;

export interface SearchResult {
  link?: string;
  name: string;
  age: string;
  type: string;
  files: number;
  size: number;
  sizeHuman: string;
  seeders: number;
  leechers: number;
}

export function getAnchorHref(parentNode: Node) {
  if (parentNode.nodeType !== 1) {
    logger.warn(`Parent node type is ${parentNode.nodeType}, not 1`);
    return "?";
  }
  const parentElem = parentNode as HTMLElement;
  if (!parentElem.querySelector) {
    logger.warn("Parent element has no `querySelector` method");
    return "?";
  }
  const node = parentElem.querySelector("a");
  const elem = node as HTMLElement;
  if (!node || !elem || node.nodeType !== 1) {
    logger.warn(`Child anchor node type: ${node?.nodeType}`);
    return "?";
  }
  if (!elem.getAttribute) {
    logger.warn("Child anchor element has no `getAttribute` method");
    return "?";
  }
  const href = elem.getAttribute("href");
  return href || "?";
}

/** Converts a human-readable formatted amount of disk space into bytes as a number.
 *
 *  E.g. `getSizeValue("309.15 KB")` -> `309150`
 */
export function getSizeValue(value: string) {
  const match = value.match(/([.0-9]+) ([A-Z]?)B/);
  if (!match) {
    return null;
  }
  const size = +match[1];
  if (isNaN(size)) {
    return null;
  }
  const unitPrefix = match[2];
  if (!unitPrefix) return size; // e.g. "347 B"
  const exponent =
    SIZE_UNIT_PREFIXES[unitPrefix as keyof typeof SIZE_UNIT_PREFIXES];
  if (!exponent) return null;
  return size * exponent;
}

const average = (values: number[]) =>
  values.reduce((acc, val) => acc + val, 0) / values.length;

const standardDeviation = (values: number[], mean: number) =>
  Math.sqrt(average(values.map((val) => (val - mean) ** 2)));

const zScore = (value: number, mean: number, sigma: number) =>
  (value - mean) / sigma;

export abstract class TorrentIndexer {
  abstract SERVICE_URL_BASE: string;
  COOKIE_HEADER: string = "";

  /** Optionally overridable method that returns the search URL using the prepared search query string. */
  getSearchUrl(query: string) {
    return this.SERVICE_URL_BASE + query;
  }

  /** An indexer-specific method which converts the HTML document obtained from the web request into a list of `SearchResult`s. */
  abstract parseSearchResults(html: HTMLElement): SearchResult[];

  /** Makes the request to the indexer and returns the response as HTML parsed by `node-html-parser`. */
  private async fetchRawResults(query: string) {
    if (!query) {
      logger.error("Empty query string when searching for torrents.");
      return null;
    }
    const url = this.getSearchUrl(query);
    let res;
    try {
      res = await axios({
        url,
        method: "GET",
        headers: {
          Cookie: this.COOKIE_HEADER,
        },
      });
    } catch (error) {
      logger.error(error);
      return null;
    }
    if (typeof res.data !== "string") {
      logger.error("Received non-string HTML content from torrent indexer");
      logger.debug(res.data);
      return null;
    }
    return parse(res.data);
  }

  /** Arbitrary algorithm to select the top torrent from a list of results.
   *
   *  @param results an unsorted array of `SearchResult`s.
   */
  public selectTopResult(results: SearchResult[]) {
    if (results.length === 0) {
      logger.warn("Passed empty results list to `selectTopResult`");
      return null;
    }
    if (results.every((result) => result.seeders === 0)) {
      logger.warn("All torrent search results have 0 seeders");
      // Since all results have 0 seeders, return the one with the most leechers. Maybe they'll be peers
      const resultsByLeechers = results.sort((a, b) => b.leechers - a.leechers);
      return resultsByLeechers[0];
    }
    const sizes = results.map((result) => result.size);
    const mean = average(sizes);
    const sigma = standardDeviation(sizes, mean);
    const resultsBySeeders = results.sort((a, b) => b.seeders - a.seeders);
    const resultsWithoutOutliers = resultsBySeeders.filter(
      (result) => result.size < mean && zScore(result.size, mean, sigma) > -1
    );
    const topResult = resultsWithoutOutliers[0];
    return topResult;
  }

  async search(episode: BasicEpisode) {
    const showName = sanitiseShowName(episode.showName);
    const serialisedEpisode = serialiseEpisode(episode);
    const query = `${showName}-${serialisedEpisode}`
      .replace(/\s/g, "-")
      .toLowerCase();
    logger.info(`Searching for '${query}'.`);
    const data = await this.fetchRawResults(query);
    if (null == data) return [];
    return this.parseSearchResults(data);
  }

  /** Finds the top torrent result from the API, using `TorrentIndexer.selectTopResult`. */
  async findTopResult(episode: BasicEpisode) {
    const results = await this.search(episode);
    if (!results || results.length === 0) {
      logger.warn("No search results found.");
      return null;
    }
    return this.selectTopResult(results);
  }
}

export interface TableStyledTorrentIndexer {
  /** Optional method which can perform amendments to the result properties. */
  fixResultProperties?(result: SearchResult, columns: Node[]): void;
}

export abstract class TableStyledTorrentIndexer extends TorrentIndexer {
  abstract TABLE_CSS_SELECTOR: string;
  abstract TABLE_HEADER_TRANSLATIONS: Record<string, keyof SearchResult>;
  TABLE_HEADER_ROW: number = 0;

  parseSearchResults(html: HTMLElement) {
    // previous magnetdl code used `thead tr.header` instead of `thead tr`.
    // can't check if it's needed as magnetdl is currently down
    const headerSelector =
      this.TABLE_CSS_SELECTOR +
      (this.TABLE_HEADER_ROW === 0
        ? " thead tr th"
        : ` tr:nth-child(${this.TABLE_HEADER_ROW}) td`);
    const headerCells = html.querySelectorAll(headerSelector) ?? [];
    const headers: Record<number, keyof SearchResult> = {};
    headerCells.forEach((cell, idx) => {
      const key =
        cell.textContent.trim() as keyof typeof this.TABLE_HEADER_TRANSLATIONS;
      const value = this.TABLE_HEADER_TRANSLATIONS[key];
      if (!value) {
        logger.warn(`Unknown parsed table header value '${key}'.`);
        return;
      }
      headers[idx] = value;
    });
    const resultRows =
      html.querySelectorAll(this.TABLE_CSS_SELECTOR + " tr") ?? [];
    const results: SearchResult[] = [];
    let rowsToSkip = this.TABLE_HEADER_ROW;
    for (const row of resultRows) {
      if (rowsToSkip > 0) {
        rowsToSkip--;
        continue;
      }
      const columns = (row.childNodes ?? []).filter(
        (child) => child.nodeType === 1
      );
      if (columns.length !== headerCells.length) continue;
      const result: SearchResult = {} as SearchResult;
      columns.forEach((column, idx) => {
        const key = headers[idx];
        if (key == null) return;
        let value = column.textContent?.trim() || getAnchorHref(column);
        switch (key) {
          case "files":
          case "seeders":
          case "leechers":
            // Numeric values
            result[key] = +value || 0;
            break;
          case "size":
            // Format: e.g. "307.90 MB"
            const size = getSizeValue(value);
            if (size == null) {
              logger.warn(`Obtained null numeric size value: ${value}`);
              return;
            }
            result.sizeHuman = value;
            result.size = size;
            break;
          default:
            result[key] = value;
            break;
        }
      });
      this.fixResultProperties?.(result, columns);
      if (result.type !== "TV") {
        logger.debug("Discarding non-TV result");
        logger.debug(result);
        continue;
      }
      results.push(result as SearchResult);
    }
    return results;
  }
}
