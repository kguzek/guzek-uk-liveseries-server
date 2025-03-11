import type { Context } from "elysia";
import Elysia from "elysia";

import { TORRENT_DOWNLOAD_PATH } from "../../lib/constants";
import { handleTorrentRequest, searchForDownloadedEpisode } from "../../lib/liveseries";
import { getLogger } from "../../lib/logger";

const logger = getLogger(__filename);

function sendFileStream(ctx: Context, path: string, extension?: string) {
  // TODO: Implement this function
}

export const videoRouter = new Elysia().get("/:showName/:season/:episode", (ctx) =>
  handleTorrentRequest(
    ctx,
    (torrent) => sendFileStream(ctx, TORRENT_DOWNLOAD_PATH + torrent.name, "mp4"),
    async (episode) => {
      const filename = await searchForDownloadedEpisode(
        ctx,
        episode,
        !!ctx.query.allow_non_mp4,
      );
      logger.info(`Backup video search result: '${filename}'`);
      if (!filename) return;
      if (typeof filename === "object") {
        // TODO:
        // return filename;
        return;
      }
      sendFileStream(ctx, filename);
    },
  ),
);
