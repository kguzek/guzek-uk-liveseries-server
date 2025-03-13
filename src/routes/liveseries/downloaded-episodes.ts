import type { Context } from "elysia";
import { Elysia, t } from "elysia";

import type {
  ConvertedTorrentInfo,
  Episode,
  EpisodeWithShowId,
  TorrentInfo,
} from "@/lib/types";
import { EPISODE_EXAMPLE, TORRENT_DOWNLOAD_PATH } from "@/lib/constants";
import { getRequestIp } from "@/lib/http";
import {
  parseEpisodeRequest,
  sanitiseShowName,
  searchForDownloadedEpisode,
  serialiseEpisode,
  torrentClient,
} from "@/lib/liveseries";
import { getLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  convertedTorrentInfoSchema,
  episodeSchema,
  episodeSchemaWithId,
  messageSchema,
} from "@/lib/schemas";
import { TorrentIndexer } from "@/torrent-indexers";
import { Eztv } from "@/torrent-indexers/eztv";

const logger = getLogger(__filename);
const torrentIndexer: TorrentIndexer = new Eztv();

async function downloadEpisode(
  data: EpisodeWithShowId,
): Promise<ConvertedTorrentInfo | null> {
  const result = await torrentIndexer.findTopResult(data);
  if (!result || !result.link) {
    logger.error(
      "Search query turned up empty. Either no torrents available, or indexer is outdated.",
    );
    return null;
  }

  const createEntry = () => prisma.downloadedEpisode.create({ data });
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

const RESPONSE_MESSAGES = {
  getAllEpisodesError: "An unknown error occurred while reading the database.",
  episodeAlreadyDownloaded: (episode: string) =>
    `Episode ${episode} is already downloaded.`,
  invalidEpisode: (episode: string) => `Invalid episode ${episode}.`,
  episodeNotFound: "Episode not found in the database.",
  deletionSuccess: "Episode deleted successfully.",
  deletionErrorDatabase: "Could not delete the episode from the database.",
  deletionErrorTorrent:
    "An unknown error occured while removing the torrent. The database entry was removed.",
  deletionErrorFiles: (torrentDeleted: boolean) =>
    `An unknown error occurred while removing the files. The ${
      torrentDeleted ? "torrent and database entry were" : "database entry was"
    } removed.`,
};

export const downloadedEpisodesRouter = new Elysia({
  prefix: "/liveseries/downloaded-episodes",
})
  .get(
    "/",
    async (ctx) => {
      try {
        const result = await prisma.downloadedEpisode.findMany();
        return result;
      } catch (error) {
        ctx.set.status = 500;
        logger.error("Could not get downloaded episodes:", error);
        return {
          message: RESPONSE_MESSAGES.getAllEpisodesError,
        };
      }
    },
    {
      response: {
        200: t.Array(
          t.Object({
            id: t.Integer({ examples: [1] }),
            ...episodeSchemaWithId.properties,
          }),
        ),
        500: messageSchema(RESPONSE_MESSAGES.getAllEpisodesError),
      },
    },
  )
  .post(
    "/",
    async (ctx) => {
      const { showName: showNameUnsanitised, season, episode, showId } = ctx.body;
      const showName = sanitiseShowName(showNameUnsanitised);

      const serialised = `'${showName}' ${serialiseEpisode({ episode, season })}`;
      const result = await prisma.downloadedEpisode.findFirst({
        where: {
          AND: [
            { episode, season },
            { OR: [{ showId }, { showName: { equals: showName, mode: "insensitive" } }] },
          ],
        },
      });
      if (result) {
        ctx.set.status = 409;
        return {
          message: RESPONSE_MESSAGES.episodeAlreadyDownloaded(serialised),
        };
      }
      const downloadedEpisode = await downloadEpisode({
        showName,
        showId,
        season,
        episode,
      });
      if (downloadedEpisode) {
        return downloadedEpisode;
      }
      ctx.set.status = 400;
      return {
        message: RESPONSE_MESSAGES.invalidEpisode(serialised),
      };
    },
    {
      body: episodeSchemaWithId,
      response: {
        200: convertedTorrentInfoSchema,
        409: messageSchema(RESPONSE_MESSAGES.episodeAlreadyDownloaded(EPISODE_EXAMPLE)),
        400: messageSchema(RESPONSE_MESSAGES.invalidEpisode(EPISODE_EXAMPLE)),
      },
    },
  )
  .delete(
    "/:showName/:season/:episode",
    async (ctx) => {
      const episode = parseEpisodeRequest(ctx);
      logger.info(`Deleting episode '${episode.showName}' ${serialiseEpisode(episode)}`);
      const torrent = await torrentClient.getTorrentInfo(episode);

      const record = await prisma.downloadedEpisode.findFirst({
        where: { ...episode, showName: sanitiseShowName(episode.showName) },
      });
      if (record == null) {
        ctx.set.status = 404;
        return {
          message: RESPONSE_MESSAGES.episodeNotFound,
        };
      }
      try {
        await prisma.downloadedEpisode.delete({ where: { id: record.id } });
      } catch (error) {
        logger.error("Could not delete database entry:", error);
        ctx.set.status = 500;
        return {
          message: RESPONSE_MESSAGES.deletionErrorDatabase,
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
            message: RESPONSE_MESSAGES.deletionErrorTorrent,
          };
        }
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
          message: RESPONSE_MESSAGES.deletionErrorFiles(torrent != null),
        };
      }

      return { message: RESPONSE_MESSAGES.deletionSuccess };
    },
    {
      params: episodeSchema,
      response: {
        200: messageSchema(RESPONSE_MESSAGES.deletionSuccess),
        404: messageSchema(RESPONSE_MESSAGES.episodeNotFound),
        500: messageSchema(
          RESPONSE_MESSAGES.deletionErrorDatabase,
          RESPONSE_MESSAGES.deletionErrorTorrent,
          RESPONSE_MESSAGES.deletionErrorFiles(true),
          RESPONSE_MESSAGES.deletionErrorFiles(false),
        ),
      },
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
