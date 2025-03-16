import type { Static } from "elysia";

import type {
  CLIENT_ERROR_STATUS_CODES,
  SERVER_ERROR_STATUS_CODES,
  SUCCESS_STATUS_CODES,
} from "./constants";
import type {
  convertedTorrentInfoSchema,
  episodeSchema,
  episodeSchemaWithId,
  payloadUserSchema,
  searchResultSchema,
  whitelistRoleSchema,
  whitelistSchema,
  whitelistUserSchema,
} from "./schemas";

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

export type Episode = Static<typeof episodeSchema>;
export type EpisodeWithShowId = Static<typeof episodeSchemaWithId>;
export type ConvertedTorrentInfo = Static<typeof convertedTorrentInfoSchema>;
export type SearchResult = Static<typeof searchResultSchema>;
export type WhitelistRole = Static<typeof whitelistRoleSchema>;
export type WhitelistUser = Static<typeof whitelistUserSchema>;
export type Whitelist = Static<typeof whitelistSchema>;
export type PayloadCmsUser = Static<typeof payloadUserSchema>;
