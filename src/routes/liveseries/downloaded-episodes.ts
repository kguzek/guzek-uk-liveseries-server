import type { Context } from "elysia";
import { Elysia } from "elysia";

import type {
  BasicTvShow,
  ConvertedTorrentInfo,
  Episode,
  TorrentInfo,
} from "@/lib/types";
import { TORRENT_DOWNLOAD_PATH } from "@/lib/constants";
import { getRequestIp } from "@/lib/http";
import {
  parseEpisodeRequest,
  sanitiseShowName,
  searchForDownloadedEpisode,
  serialiseEpisode,
  torrentClient,
} from "@/lib/liveseries";
import { getLogger } from "@/lib/logger";
import { episodeSchema, episodeSchemaWithId } from "@/lib/schemas";
import { TorrentIndexer } from "@/torrent-indexers";
import { Eztv } from "@/torrent-indexers/eztv";

const logger = getLogger(__filename);
const torrentIndexer: TorrentIndexer = new Eztv();

async function downloadEpisode(
  data: BasicTvShow & Episode,
): Promise<ConvertedTorrentInfo | null> {
  const result = await torrentIndexer.findTopResult(data);
  if (!result || !result.link) {
    logger.error(
      "Search query turned up empty. Either no torrents available, or indexer is outdated.",
    );
    return null;
  }

  const modelParams = { ...data };
  const createEntry = () => DownloadedEpisode.create(modelParams);
  let torrentInfo: ConvertedTorrentInfo | null;
  try {
    torrentInfo = await torrentClient.addTorrent(result.link, createEntry);
  } catch {
    logger.error("The torrent client is unavailable");
    return null;
  }
  if (!torrentInfo) {
    logger.error(`Adding the torrent to the client failed.`);
    return null;
  }
  await createEntry();
  logger.info("Successfully added new torrent.");
  return torrentInfo;
}

async function deleteEpisode(
  ctx: Pick<Context, "set">,
  episode: Episode,
  torrent?: TorrentInfo,
) {
  logger.info(`Deleting episode '${episode.showName}' ${serialiseEpisode(episode)}`);
  let destroyedRows;
  try {
    destroyedRows = await DownloadedEpisode.destroy({
      where: { ...episode, showName: sanitiseShowName(episode.showName) },
    });
  } catch (error) {
    logger.error("Could not delete database entry:", error);
    ctx.set.status = 500;
    return {
      message: "Could not delete the episode from the database.",
    };
  }
  if (!destroyedRows) {
    ctx.set.status = 404;
    return {
      message: "Episode not found in the database.",
    };
  }
  let filename: string | void;
  let file;
  if (torrent) {
    try {
      await torrentClient.removeTorrent(torrent);
    } catch (error) {
      logger.error("Could not remove torrent:", error);
      ctx.set.status = 500;
      return {
        message: `An unknown error occured while removing the torrent. The database entry was removed.`,
      };
    }
    sendWebsocketMessage();
    filename = torrent.name;
    file = Bun.file(TORRENT_DOWNLOAD_PATH + filename);
  } else {
    const result = await searchForDownloadedEpisode(ctx, episode);
    if (result.error != null) {
      return result.error;
    }
    file = result.file;
  }

  try {
    await file.delete();
  } catch (error) {
    logger.error(error);
    ctx.set.status = 500;
    return {
      message: `An unknown error occurred while removing the files. The ${
        torrent ? "torrent and database entry were" : "database entry was"
      } removed.`,
    };
  }

  return { message: "Episode deleted successfully." };
}

export const downloadedEpisodesRouter = new Elysia({
  prefix: "/liveseries/downloaded-episodes",
})
  .post(
    "/",
    async (ctx) => {
      const showName = ctx.body?.showName;
      const showId = +ctx.body?.showId;
      const season = +ctx.body?.season;
      const episode = +ctx.body?.episode;

      const serialised = `'${showName}' ${serialiseEpisode({ episode, season })}`;

      const where = {
        showId,
        episode,
        season,
      };
      const result = await DownloadedEpisode.findOne({ where });
      if (result) {
        ctx.set.status = 409;
        return {
          message: `Episode ${serialised} is already downloaded.`,
        };
      }
      const downloadedEpisode = await downloadEpisode({ showName, ...where });
      if (downloadedEpisode) {
        return downloadedEpisode;
      }
      ctx.set.status = 400;
      return {
        message: `Invalid episode ${serialised}`,
      };
    },
    {
      body: episodeSchemaWithId,
    },
  )
  .delete(
    "/:showName/:season/:episode",
    (ctx) => {
      const episode = parseEpisodeRequest(ctx);
      return deleteEpisode(ctx, episode);
    },
    {
      params: episodeSchema,
    },
  )
  .ws("/ws", {
    open(ws) {
      if (!torrentClient) {
        const error = "Websocket connection established without active torrent client.";
        logger.error(error);
        ws.send({ error });
        ws.close();
        return;
      }
    },

    close(ws) {
      logger.http(
        `Websocket connection with ${getRequestIp(ws.data)} (${ws.id}) closed.`,
      );
    },

    error(ctx) {
      logger.error(`Websocket error with ${getRequestIp(ctx)}`);
    },

    message(ws, message: { type: string; data: ConvertedTorrentInfo[] }) {
      switch (message.type) {
        case "poll":
          torrentClient
            .getAllTorrentInfos()
            .then((data) => {
              ws.send({ data });
            })
            .catch((error) => {
              logger.error("Error while performing websocket action:", error);
              ws.send({ data: [] });
            });
          break;
        default:
          const error = `Unknown message type '${message.type}'.`;
          logger.warn(error);
          ws.send({ error });
          return;
      }
    },
  });
