import { getLogger } from "../lib/logger";
import { getRequestIp, getStatusText } from "../lib/http";
import type { Context } from "elysia";

const logger = getLogger(__filename);

const SENSITIVE_FIELDS = [
  "password",
  "oldPassword",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
];

type GenericBody = Record<string, any>;

export async function logRequest({
  request,
  body,
  path,
  server,
  query,
}: Pick<Context, "request" | "body" | "path" | "server"> & {
  query?: Record<string, string | undefined>;
}) {
  // Ensure passwords are not logged in plaintext
  if (body && typeof body === "object") {
    for (const sensitiveField of SENSITIVE_FIELDS) {
      if (!(body as GenericBody)[sensitiveField]) continue;
      (body as GenericBody)[sensitiveField] = "********";
    }
  }
  const ip = server?.requestIP(request);
  // Needed to log the IP address during response
  // response.ip = ip;
  if (query?.token) {
    query.token = "********";
  }
  const searchParams = query
    ? new URLSearchParams(
        Object.entries(query).map(([k, v]) => [k, v || ""]),
      ).toString()
    : "";
  const queryString = searchParams.length > 0 ? `?${searchParams}` : "";
  logger.request(`${request.method} ${path}${queryString}`, {
    ip,
    body,
  });
}

export async function logResponse({
  request,
  server,
  set,
}: Pick<Context, "request" | "server" | "set">) {
  const ip = server?.requestIP(request);
  // Needed to log the IP address during response
  // response.ip = ip;
  logger.response(getStatusText(set.status), { ip });
}
