import { t } from "elysia";

import { EPISODE_EXAMPLE } from "./constants";
import { getStatusText } from "./http";

export const messageSchema = (status: number, example: string, ...examples: string[]) =>
  t.Object({
    message: t.String({ examples: [example, ...examples] }),
    status: t.Optional(t.String({ examples: [getStatusText(status)] })),
  });

export const episodeSchema = t.Object({
  showName: t.String({ examples: ["Chicago Fire"] }),
  season: t.Integer({ minimum: 1, examples: [13] }),
  episode: t.Integer({ minimum: 1, examples: [15] }),
});

export const episodeSchemaWithId = t.Object({
  ...episodeSchema.properties,
  showId: t.Integer({ minimum: 1, examples: [59] }),
});

export const downloadedEpisodeSchema = t.Object({
  ...episodeSchema.properties,
  status: t.Integer({ examples: [5] }),
});

export const convertedTorrentInfoSchema = t.Object({
  ...downloadedEpisodeSchema.properties,
  progress: t.Optional(t.Number()),
  speed: t.Optional(t.Number()),
  eta: t.Optional(t.Number()),
});

export const searchResultSchema = t.Object({
  name: t.String({ examples: [`${EPISODE_EXAMPLE} Too Close 1080p`] }),
  link: t.Optional(t.String({ examples: ["magnet:?xt=urn:btih:..."] })),
  sizeHuman: t.String({ examples: ["2.33 GB", "306 MB"] }),
  size: t.Integer({ examples: [2330000000, 306000000] }),
  age: t.String({ examples: ["6d 13h", "1 mo"] }),
  seeders: t.Integer({ examples: [488] }),
  files: t.Integer({ examples: [1] }),
  type: t.String({ examples: ["TV"] }),
  leechers: t.Optional(t.Integer({ examples: [217] })),
});

export const whitelistRoleSchema = t.Union([
  t.Literal("owner"),
  t.Literal("uploader"),
  t.Literal("viewer"),
  t.Literal("cron"),
]);

export const whitelistUserSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.Optional(t.String()),
  role: whitelistRoleSchema,
});

export const whitelistSchema = t.Array(whitelistUserSchema);

export const payloadUserSchema = t.Object({
  id: t.String({ format: "uuid" }),
  role: t.String(),
  serverUrl: t.String(),
});

export const payloadUserResponseSchema = t.Object({
  user: t.Union([payloadUserSchema, t.Null()]),
  message: t.String(),
});

export const accessTokenSchema = t.Object({
  access_token: t.Optional(t.String()),
});
