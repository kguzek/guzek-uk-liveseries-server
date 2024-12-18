import { SearchResult, TableStyledTorrentIndexer } from "./torrentIndexer";

export class Eztv extends TableStyledTorrentIndexer {
  TABLE_CSS_SELECTOR = "#header_holder > table:last-of-type";
  TABLE_HEADER_TRANSLATIONS = {
    "Episode Name": "name",
    Size: "size",
    Released: "age",
    Seeds: "seeders",
    LEECH: "leechers",
    Dload: "link",
  } as const;
  SERVICE_URL_BASE = "https://eztvx.to/search/";
  COOKIE_HEADER = "layout=def_wlinks;";
  TABLE_HEADER_ROW = 2;

  fixResultProperties(result: SearchResult) {
    result.files = 1;
    result.type = "TV";
  }
}

