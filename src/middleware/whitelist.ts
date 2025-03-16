import { NextFunction, Response } from "express";
import { CustomRequest, UserObj } from "guzek-uk-common/models";
import { isLanRequest, sendError } from "guzek-uk-common/lib/http";
import { getLogger } from "guzek-uk-common/lib/logger";
import type { StatusCode } from "guzek-uk-common/models";
import whitelist from "../../whitelist.json";

const logger = getLogger(__filename);

const ALLOW_LAN_BYPASS =
  process.env.ALLOW_UNAUTHENTICATED_LAN_REQUESTS === "true";

const ALLOW_GET_REQUESTS =
  process.env.ALLOW_UNAUTHENTICATED_GET_REQUESTS === "true";

const PUBLIC_PATHS = ["/health", "/favicon.ico"];

function isWhitelisted(user: UserObj) {
  return (whitelist as string[]).includes(user.uuid);
}

export function getWhitelistMiddleware(debugMode: boolean) {
  const whitelistDisabled =
    debugMode && process.env.DANGEROUSLY_DISABLE_WHITELIST === "true";

  if (whitelistDisabled) {
    logger.warn(
      "Whitelist is disabled: all users will be able to access this server. Do not use this setting in production!",
    );
  } else {
    logger.info(
      "Whitelist is enabled: only specific, authenticated users can access this server.",
    );
  }

  return function (req: CustomRequest, res: Response, next: NextFunction) {
    if (whitelistDisabled) return next();

    if (PUBLIC_PATHS.includes(req.path)) return next();

    if (ALLOW_LAN_BYPASS && isLanRequest(req)) return next();

    if (ALLOW_GET_REQUESTS && req.method === "GET") return next();

    function reject(code: StatusCode, message: string) {
      sendError(res, code, { message });
    }

    if (!req.user) {
      return reject(401, "You must be authorised to access this resource.");
    }
    if (!req.user.admin && !isWhitelisted(req.user)) {
      reject(403, "You do not have permission to access this resource.");
      logger.info(
        `Non-whitelisted user attempted access: ${req.user.uuid} (${req.user.username})`,
      );
      return;
    }
    next();
  };
}
