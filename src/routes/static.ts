import Elysia, { file } from "elysia";

import { STATIC_CACHE_DURATION_MINS } from "@/lib/constants";
import { setCacheControl } from "@/lib/http";

export const staticRouter = new Elysia().get("/favicon.ico", (ctx) => {
  setCacheControl(ctx, STATIC_CACHE_DURATION_MINS);
  return file("src/public/favicon.ico");
});
