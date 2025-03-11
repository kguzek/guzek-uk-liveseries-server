import Elysia, { t } from "elysia";

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
      message: t.Literal(HEALTHCHECK_MESSAGE),
      uptime: t.Number(),
      date: t.String(),
    }),
  },
);
