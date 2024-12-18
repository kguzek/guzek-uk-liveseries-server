import { Node } from "node-html-parser";
import {
  getAnchorHref,
  SearchResult,
  TableStyledTorrentIndexer,
} from "./torrentIndexer";

export class Extranet extends TableStyledTorrentIndexer {
  SERVICE_URL_BASE =
    "https://extranet.torrentbay.st/search/?order=seed&sort=desc&q=";
  TABLE_CSS_SELECTOR = "table.search-table";
  TABLE_HEADER_TRANSLATIONS = {
    "TORRENT NAME": "name",
    SIZE: "size",
    FILES: "files",
    AGE: "age",
    SEED: "seeders",
    LEECH: "leechers",
  } as const;

  fixResultProperties(result: SearchResult, columns: Node[]) {
    const firstColumn = columns[0];
    const name = firstColumn?.childNodes[0]?.childNodes[1]?.textContent;
    if (name) result.name = name;
    const type =
      firstColumn?.childNodes[0]?.childNodes[2]?.childNodes[1].textContent;
    if (type) result.type = type;
    const anchorParentElement = firstColumn?.childNodes[1];
    const link = getAnchorHref(anchorParentElement);
    result.link = link;
  }
}

