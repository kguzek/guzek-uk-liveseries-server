import type {
  CLIENT_ERROR_STATUS_CODES,
  SERVER_ERROR_STATUS_CODES,
  SUCCESS_STATUS_CODES,
} from "./constants";

export type RequestMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH";

export type SuccessStatusCode = keyof typeof SUCCESS_STATUS_CODES;
export type ClientErrorStatusCode = keyof typeof CLIENT_ERROR_STATUS_CODES;
export type ServerErrorStatusCode = keyof typeof SERVER_ERROR_STATUS_CODES;
export type StatusCode =
  | SuccessStatusCode
  | ClientErrorStatusCode
  | ServerErrorStatusCode;

export interface TorrentInfo {
  id: number;
  name: string;
  status: number;
  rateDownload?: number;
  eta?: number;
  percentDone?: number;
}

export interface BasicTvShow {
  showName: string;
  showId: number;
}

export interface Episode {
  showName: string;
  season: number;
  episode: number;
}

export interface ConvertedTorrentInfo extends Episode {
  status: number;
  progress?: number;
  speed?: number;
  eta?: number;
}

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
