import { t } from "elysia";

export const messageSchema = (example: string, ...examples: string[]) =>
  t.Object({
    message: t.String({ examples: [example, ...examples] }),
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

export const convertedTorrentInfoSchema = t.Object({
  ...episodeSchema.properties,
  status: t.Number(),
  progress: t.Optional(t.Number()),
  speed: t.Optional(t.Number()),
  eta: t.Optional(t.Number()),
});

export const searchResultSchema = t.Object({
  name: t.String(),
  link: t.Optional(t.String()),
  sizeHuman: t.String(),
  size: t.Number(),
  age: t.String(),
  seeders: t.Number(),
  files: t.Number(),
  type: t.String(),
  leechers: t.Optional(t.Number()),
});
