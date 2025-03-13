import Elysia, { t } from "elysia";

import { messageSchema } from "@/lib/schemas";

const HEALTHCHECK_MESSAGE = "Server is up" as const;

export const healthRouter = new Elysia().get(
  "/health",
  () => ({
    message: HEALTHCHECK_MESSAGE,
    uptime: Math.round(process.uptime() * 100) / 100,
    date: new Date().toISOString(),
  }),
  {
    response: t.Object({
      ...messageSchema(HEALTHCHECK_MESSAGE).properties,
      uptime: t.Number(),
      date: t.String({ examples: [new Date().toISOString()] }),
    }),
  },
);
