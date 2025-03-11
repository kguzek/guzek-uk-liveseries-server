import { t } from "elysia";

export const messageSchema = t.Object({
  message: t.String(),
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
