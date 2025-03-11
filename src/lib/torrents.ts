import type { ConvertedTorrentInfo, TorrentInfo } from "./types";
import { DOWNLOAD_STATUS_MAP, DownloadStatus, TORRENT_NAME_PATTERN } from "./constants";
import { getLogger } from "./logger";

const logger = getLogger(__filename);

function getDownloadStatus(status: number) {
  const val = DOWNLOAD_STATUS_MAP[status as keyof typeof DOWNLOAD_STATUS_MAP];
  if (val != null) return val;
  logger.warn(`Unknown torrent status code '${status}'.`);
  return DownloadStatus.UNKNOWN;
}

/** Converts the data into the form useful to the client application. */
export function convertTorrentInfo(info: TorrentInfo): ConvertedTorrentInfo {
  if (!info.name) throw new Error("Torrent info has no name attribute");
  const match = info.name.match(TORRENT_NAME_PATTERN);
  if (!match) throw new Error(`Torrent name doesn't match regex: '${info.name}'.`);
  const [_, showName, season, episode] = match;
  return {
    status: getDownloadStatus(info.status),
    showName: showName.replace(/\./g, " "),
    season: +season,
    episode: +episode,
    progress: info.percentDone,
    speed: info.rateDownload,
    eta: info.eta,
  };
}
