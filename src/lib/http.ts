import type { Context } from "elysia";

import type { StatusCode } from "./types";
import { STATUS_CODES } from "./constants";

/** Extracts the request's originating IP address, taking into account proxies. */
export function getRequestIp(ctx: Context) {
  const ip = ctx.headers["cf-connecting-ip"] || ctx.headers["x-forwarded-for"];
  if (!ip) return ctx.server?.requestIP(ctx.request)?.address;
  if (Array.isArray(ip)) return ip[0];
  return ip.split(",")[0].trim();
}

/** Returns the code followed by the status code name according to RFC2616 § 10 */
export const getStatusText = (code?: number | string) =>
  typeof code === "string" && code
    ? code
    : !code
      ? "<Unknown>"
      : `${code} ${
          code in STATUS_CODES ? STATUS_CODES[code as StatusCode] : "<Unknown>"
        }`;

/** Returns mkv, mp4 or avi if the input filename ends with either of those, or undefined. */
export const getVideoExtension = (filename: string) =>
  filename.match(/\.(mkv|mp4|avi)$/)?.[1];

/** Sets the Cache-Control header in the response so that browsers will be able to cache it for a maximum of `maxAgeMinutes` minutes. */
export const setCacheControl = (ctx: Pick<Context, "headers">, maxAgeMinutes: number) =>
  (ctx.headers["Cache-Control"] = `public, max-age=${maxAgeMinutes * 60}`);
