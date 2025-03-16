import Elysia, { t } from "elysia";

import { getStatusText } from "@/lib/http";
import { messageSchema } from "@/lib/schemas";

const HEALTHCHECK_MESSAGE = "Server is up" as const;

const getUptime = (base?: number) => Math.round((base ?? process.uptime()) * 100) / 100;

export const healthRouter = new Elysia().get(
  "/health",
  () => ({
    message: HEALTHCHECK_MESSAGE,
    status: getStatusText(200),
    uptime: getUptime(),
    date: new Date().toISOString(),
  }),
  {
    response: t.Object({
      ...messageSchema(200, HEALTHCHECK_MESSAGE).properties,
      uptime: t.Number({ examples: [getUptime(Math.random() * 1000)] }),
      date: t.String({ examples: [new Date().toISOString()] }),
    }),
  },
);
