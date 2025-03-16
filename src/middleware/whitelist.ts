import { Elysia } from "elysia";

import type { RequestMethod, WhitelistRole } from "@/lib/types";
import {
  getUserFromToken,
  isWhitelistStale,
  readWhitelistFile,
  whitelistMetadata,
} from "@/lib/auth";
import { getStatusText } from "@/lib/http";
import { getLogger } from "@/lib/logger";

const logger = getLogger(__filename);

type PermissionCategory = Exclude<WhitelistRole, "owner"> | "public";

const PERMISSIONS: Record<
  PermissionCategory,
  Partial<Record<RequestMethod, string[]>>
> = {
  public: {
    GET: ["/favicon.ico", "/health", "/swagger", "/liveseries/downloaded-episodes/ws"],
  },
  viewer: {
    GET: [
      "/liveseries/video",
      "/liveseries/subtitles",
      // "/liveseries/downloaded-episodes", // not needed for frontend, useful for debugging
    ],
  },
  cron: {
    POST: ["/liveseries/downloaded-episodes"],
  },
};

export const whitelistMiddleware = (app: Elysia) =>
  app
    .derive({ as: "scoped" }, async (ctx) => {
      const token =
        ctx.headers["authorization"]?.match(/^Bearer (.+)$/)?.at(1) ||
        ctx.cookie["payload-token"]?.value ||
        ctx.query["access_token"];
      const user = await getUserFromToken(token);
      return { user };
    })
    .onBeforeHandle(async (ctx) => {
      const method = ctx.request.method.toUpperCase() as RequestMethod;

      function isAllowed(category: PermissionCategory) {
        const permissions = PERMISSIONS[category][method];
        return (
          permissions != null &&
          permissions.some((endpoint) => ctx.path.startsWith(endpoint))
        );
      }

      function reject(status: number, message: string) {
        if (isAllowed("public")) {
          return;
        }
        ctx.set.status = status;
        logger.http(`Rejecting ${method} ${ctx.path} with status ${status}`);
        return { message, status: getStatusText(status) };
      }

      if (whitelistMetadata.whitelist == null || isWhitelistStale()) {
        const result = await readWhitelistFile();
        if (result.message) {
          logger.crit(result.message, result.error);
          app.stop(false);
          return reject(500, "The whitelist was not set up correctly");
        }
        whitelistMetadata.whitelist = result.whitelist;
        whitelistMetadata.lastReadTimestamp = Date.now();
      }

      const user = ctx.user;
      if (!user) {
        return reject(401, "This route requires authentication.");
      }
      const whitelistItem = whitelistMetadata.whitelist.find(
        (item) => item.uuid === user.id,
      );
      const allowed =
        whitelistItem == null
          ? false
          : whitelistItem.role === "owner" || isAllowed(whitelistItem.role);
      if (!allowed) {
        return reject(403, "You are not authorized to access this resource");
      }
    });
