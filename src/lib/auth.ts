import { Value } from "@sinclair/typebox/value";

import type { PayloadCmsUser, Whitelist } from "./types";
import { PAYLOADCMS_URL_BASE } from "./constants";
import { getLogger } from "./logger";
import { payloadUserResponseSchema, whitelistSchema } from "./schemas";

const logger = getLogger(__filename);
const WHITELIST_REFRESH_INTERVAL = 600000; // 10 minutes

export const whitelistMetadata: { whitelist?: Whitelist; lastReadTimestamp: number } = {
  lastReadTimestamp: 0,
};

export const isWhitelistStale = () =>
  whitelistMetadata.lastReadTimestamp < Date.now() - WHITELIST_REFRESH_INTERVAL;

export async function readWhitelistFile() {
  let json;
  try {
    json = await Bun.file("whitelist.json").json();
  } catch (error) {
    return { message: "Failed to read whitelist.json", error } as const;
  }
  const errors = [...Value.Errors(whitelistSchema, json)];
  if (errors.length > 0) {
    return {
      message: "Failed to validate whitelist.json",
      error: errors,
    } as const;
  }
  return { whitelist: json as Whitelist } as const;
}

export async function getUserFromToken(token?: string): Promise<PayloadCmsUser | null> {
  if (!token) {
    return null;
  }
  try {
    const result = await fetch(`${PAYLOADCMS_URL_BASE}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!result.ok) {
      throw new Error(`Received ${result.status} response`);
    }
    const json = await result.json();
    const response = Value.Parse(payloadUserResponseSchema, json);
    if (!response.user) {
      throw new Error("No user found in response");
    }
    return response.user;
  } catch (error) {
    logger.error(
      `Error verifying PayloadCMS token: ${error instanceof Error ? error.message : "<unknown error>"}`,
    );
    return null;
  }
}

export const findWhitelistedUser = (user?: PayloadCmsUser | null) =>
  user &&
  whitelistMetadata.whitelist &&
  whitelistMetadata.whitelist.find((item) => item.uuid === user.id);
