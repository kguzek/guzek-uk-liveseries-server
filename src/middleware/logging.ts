import { Context, Elysia } from "elysia";

import { getRequestIp, getStatusText } from "@/lib/http";
import { getLogger } from "@/lib/logger";

const logger = getLogger(__filename);

const SENSITIVE_FIELDS = [
  "password",
  "oldPassword",
  "newPassword",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
];

type GenericBody = Record<string, any>;

async function logRequest(
  ctx: Pick<Context, "request" | "headers" | "body" | "path" | "server"> & {
    query?: Record<string, string | undefined>;
  },
) {
  const body =
    ctx.body && typeof ctx.body === "object" ? ({ ...ctx.body } as GenericBody) : {};
  const query =
    ctx.query && typeof ctx.query === "object" ? ({ ...ctx.query } as GenericBody) : {};
  // Ensure passwords are not logged in plaintext
  if (body) {
    for (const sensitiveField of SENSITIVE_FIELDS) {
      if (!body[sensitiveField]) continue;
      body[sensitiveField] = "********";
    }
  }
  if (query && typeof query === "object") {
    for (const sensitiveField of SENSITIVE_FIELDS) {
      if (!query[sensitiveField]) continue;
      query[sensitiveField] = "********";
    }
  }
  const ip = getRequestIp(ctx);
  const searchParams = query
    ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, v || ""])).toString()
    : "";
  const queryString = searchParams.length > 0 ? `?${searchParams}` : "";
  logger.request(`${ctx.request.method} ${ctx.path}${queryString}`, { ip, body });
}

async function logResponse(ctx: Pick<Context, "headers" | "request" | "server" | "set">) {
  const ip = getRequestIp(ctx);
  logger.response(getStatusText(ctx.set.status), { ip });
}

export const loggingMiddleware = (app: Elysia) =>
  app
    .onBeforeHandle(logRequest)
    .onAfterResponse(logResponse)
    .onError((ctx) => {
      if (ctx.code === "NOT_FOUND") {
        ctx.set.status = 404;
        logRequest(ctx);
        logResponse(ctx);
      }
    });
