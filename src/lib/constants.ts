import { join, resolve } from "path";

export const TORRENT_NAME_PATTERN = /^(.+)(?:\.|\s|\+)S0?(\d+)E0?(\d+)/;

export const DEV_MODE = process.env.NODE_ENV === "development";

export const DownloadStatus = {
  STOPPED: 1,
  PENDING: 2,
  COMPLETE: 3,
  FAILED: 4,
  UNKNOWN: 5,
  VERIFYING: 6,
};

export const DOWNLOAD_STATUS_MAP = {
  2: DownloadStatus.VERIFYING,
  4: DownloadStatus.PENDING,
  6: DownloadStatus.COMPLETE,
} as const;

export const SUCCESS_STATUS_CODES = {
  200: "OK",
  201: "Created",
  204: "No Content",
  206: "Partial Content",
} as const;

export const CLIENT_ERROR_STATUS_CODES = {
  400: "Bad Request",
  401: "Unauthorised",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  409: "Conflict",
  422: "Unprocessable Content",
  429: "Too Many Requests",
} as const;

export const SERVER_ERROR_STATUS_CODES = {
  500: "Internal Server Error",
  503: "Service Unavailable",
};

export const STATUS_CODES = {
  ...SUCCESS_STATUS_CODES,
  ...CLIENT_ERROR_STATUS_CODES,
  ...SERVER_ERROR_STATUS_CODES,
} as const;

export const TORRENT_DOWNLOAD_PATH = resolve(
  join(
    process.env.TR_DOWNLOAD_PATH || "/var/lib/transmission-daemon/downloads",
    process.env.TR_APPEND_COMPLETE_TO_DOWNLOAD_PATH === "true" ? "/complete" : "",
  ),
);

export const STATIC_CACHE_DURATION_MINS = 30 * 24 * 60; // 30 days in minutes

export const EPISODE_EXAMPLE = "Chicago Fire S13E15";
const CORS_ORIGINS_DEV = DEV_MODE ? ["localhost"] : [];
const ADDITIONAL_CORS_ORIGINS = process.env.CORS_ORIGINS?.split(",") ?? [];
export const CORS_ORIGINS = [
  "www.guzek.uk",
  "beta.guzek.uk",
  ...CORS_ORIGINS_DEV,
  ...ADDITIONAL_CORS_ORIGINS,
].reduce<string[]>((acc, origin) => {
  const trimmed = origin.trim();
  if (trimmed) {
    acc.push(trimmed);
  }
  return acc;
}, []);

export const PAYLOADCMS_URL_BASE = "https://www.guzek.uk";
