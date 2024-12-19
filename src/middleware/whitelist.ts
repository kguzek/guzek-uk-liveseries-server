import { NextFunction, Response } from "express";
import { CustomRequest, UserObj } from "guzek-uk-common/models";
import { sendError, StatusCode } from "guzek-uk-common/util";
import whitelist from "../../whitelist.json";

function isWhitelisted(user: UserObj) {
  return whitelist.includes(user.username);
}

export function whitelistMiddleware(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  function reject(code: StatusCode, message: string) {
    sendError(res, code, { message });
  }

  if (req.originalUrl.endsWith("/ws/.websocket")) return next();

  if (!req.user) {
    return reject(401, "You must be authorised to access this resource.");
  }
  if (!req.user.admin && !isWhitelisted(req.user)) {
    reject(403, "You do not have permission to access this resource.");
    return;
  }
  next();
}
