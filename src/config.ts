export const TORRENT_DOWNLOAD_PATH = `${
  process.env.TR_DOWNLOAD_PATH?.replace(/\/$/, "") ||
  "/var/lib/transmission-daemon/downloads"
}${
  process.env.TR_APPEND_COMPLETE_TO_DOWNLOAD_PATH === "true" ? "/complete" : ""
}/`;
