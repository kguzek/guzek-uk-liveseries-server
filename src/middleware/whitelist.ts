import { Elysia } from "elysia";

import type { RequestMethod, WhitelistRole } from "@/lib/types";
import {
  findWhitelistedUser,
  getUserFromToken,
  isWhitelistStale,
  readWhitelistFile,
  whitelistMetadata,
} from "@/lib/auth";
import { getStatusText } from "@/lib/http";
import { getLogger } from "@/lib/logger";

const logger = getLogger(__filename);

type PermissionCategory = Exclude<WhitelistRole, "owner"> | "public";
type PermissionsRecord = Partial<Record<RequestMethod, string[]>>;

const VIEWER_PERMISSIONS: PermissionsRecord = {
  GET: [
    "/liveseries/video",
    "/liveseries/subtitles",
    // "/liveseries/downloaded-episodes", // not needed for frontend, useful for debugging
  ],
};

const CRON_PERMISSIONS: PermissionsRecord = {
  POST: ["/liveseries/downloaded-episodes"],
};

const PERMISSIONS: Record<PermissionCategory, PermissionsRecord> = {
  public: {
    GET: ["/favicon.ico", "/health", "/swagger", "/liveseries/downloaded-episodes/ws"],
    OPTIONS: ["/liveseries/downloaded-episodes"],
  },
  viewer: VIEWER_PERMISSIONS,
  uploader: {
    ...VIEWER_PERMISSIONS,
    ...CRON_PERMISSIONS,
  },
  cron: CRON_PERMISSIONS,
};

export const whitelistMiddleware = (app: Elysia) => {
  const WHITELIST_DISABLED = process.env.DANGEROUSLY_DISABLE_WHITELIST === "true";
  if (WHITELIST_DISABLED) {
    logger.warn("Whitelist is disabled. This setting should not be used in production!");
  }
  const AUTHENTICATION_DISABLED =
    process.env.DANGEROUSLY_DISABLE_AUTHENTICATION === "true";
  if (AUTHENTICATION_DISABLED) {
    logger.warn(
      "Authentication is disabled. This setting should not be used in production!",
    );
  }
  const GET_BYPASS_ENABLED = process.env.ALLOW_UNAUTHENTICATED_GET_REQUESTS === "true";
  if (GET_BYPASS_ENABLED) {
    logger.warn(
      "Unauthenticated GET requests are allowed. This may lead to network overuse!",
    );
  }

  return app
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
        if (method === "GET" && GET_BYPASS_ENABLED) {
          logger.verbose("Bypassing rejection for unauthorized GET request");
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
      if (!user && !AUTHENTICATION_DISABLED) {
        return reject(401, "This route requires authentication.");
      }
      const whitelistItem = findWhitelistedUser(user);
      const allowed =
        whitelistItem == null
          ? !WHITELIST_DISABLED
          : whitelistItem.role === "owner" || isAllowed(whitelistItem.role);
      if (!allowed && !AUTHENTICATION_DISABLED) {
        return reject(403, "You are not authorized to access this resource");
      }
    });
};
