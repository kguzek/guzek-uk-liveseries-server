import { NextFunction, Response } from "express";
import { CustomRequest, UserObj } from "guzek-uk-common/models";
import { isLanRequest, sendError } from "guzek-uk-common/lib/http";
import { getLogger } from "guzek-uk-common/lib/logger";
import type { StatusCode } from "guzek-uk-common/models";
import whitelist from "../../whitelist.json";

const logger = getLogger(__filename);

const ALLOW_LAN_BYPASS =
  process.env.ALLOW_UNAUTHENTICATED_LAN_REQUESTS === "true";

function isWhitelisted(user: UserObj) {
  return whitelist.includes(user.username);
}

export function getWhitelistMiddleware(debugMode: boolean) {
  const whitelistDisabled =
    debugMode && process.env.DANGEROUSLY_DISABLE_WHITELIST === "true";

  if (whitelistDisabled) {
    logger.warn(
      "Whitelist is disabled: all users will be able to access this server. Do not use this setting in production!"
    );
  } else {
    logger.info(
      "Whitelist is enabled: only specific, authenticated users can access this server."
    );
  }

  return function (req: CustomRequest, res: Response, next: NextFunction) {
    if (whitelistDisabled) return next();

    if (req.path === "/health") return next();

    if (ALLOW_LAN_BYPASS && isLanRequest(req)) return next();

    function reject(code: StatusCode, message: string) {
      sendError(res, code, { message });
    }

    if (!req.user) {
      return reject(401, "You must be authorised to access this resource.");
    }
    if (!req.user.admin && !isWhitelisted(req.user)) {
      reject(403, "You do not have permission to access this resource.");
      logger.info(`Non-whitelisted user attempted access: ${req.user.uuid} (${req.user.username})`);
      return;
    }
    next();
  };
}
