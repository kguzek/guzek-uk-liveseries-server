import { TableStyledTorrentIndexer } from "./torrentIndexer";

const SEEDERS_SUFFIX = "/se/desc/";
// const LEECHERS_SUFFIX = "/le/desc/";

export class MagnetDL extends TableStyledTorrentIndexer {
  SERVICE_URL_BASE = "https://www.magnetdl.com";
  TABLE_CSS_SELECTOR = "table.download";
  TABLE_HEADER_TRANSLATIONS = {
    DL: "link",
    "Download Name": "name",
    Age: "age",
    Type: "type",
    Files: "files",
    Size: "size",
    SE: "seeders",
    LE: "leechers",
  } as const;

  getSearchUrl(query: string) {
    const firstLetter = query[0];
    return `${this.SERVICE_URL_BASE}/${firstLetter}/${query}${SEEDERS_SUFFIX}`;
  }
}
