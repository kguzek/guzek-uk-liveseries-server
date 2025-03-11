import path from "path";
import { createLogger, format, Logger, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export const LOG_DIRECTORY = "/var/log/guzek-uk";

const C = {
  clear: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    orange: "\x1b[38;5;208m",
  },

  bg: {
    black: "\x1b[40m",
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
    magenta: "\x1b[45m",
    cyan: "\x1b[46m",
    white: "\x1b[47m",
    orange: "\x1b[48;5;208m",
  },
};

type LogFunction = (message: string, ...meta: any[]) => Logger;

interface CustomLogger extends Logger {
  request: LogFunction;
  response: LogFunction;
}

const LOG_LEVELS = {
  crit: 0,
  error: 1,
  warn: 2,
  info: 3,
  response: 4,
  request: 5,
  http: 6,
  verbose: 7,
  debug: 8,
} as const;

const COLORS: Record<"level" | "message", Record<string, string>> = {
  level: {
    crit: C.fg.red,
    error: C.bg.red,
    warn: C.bg.yellow + C.fg.black,
    info: C.fg.green,
    response: C.bg.magenta + C.fg.black,
    request: C.fg.magenta,
    http: C.fg.orange,
    verbose: C.fg.yellow,
    debug: C.fg.cyan,
  },
  message: {
    crit: C.bg.red + C.bright,
    error: C.fg.red + C.bright,
    warn: C.fg.yellow + C.bright,
  },
};

const isError = (metadata: any): metadata is { stack: string } =>
  Object.keys(metadata === 1) && "stack" in metadata;

const containsIp = (metadata: any): metadata is { ip: string } =>
  typeof (metadata as any).ip === "string";

const logFormat = format.printf(({ timestamp, level, message, metadata }) => {
  if (typeof message !== "string") message = JSON.stringify(message);
  message = `${COLORS.message[level] ?? ""}${
    message || `${C.reverse}(empty message)`
  }${C.clear}`;
  const formattedLevel = (COLORS.level[level] ?? "") + level + C.clear;
  let filename;
  ({ filename, ...metadata } = metadata as Record<string, any>);
  const metaProvided = metadata != null && Object.keys(metadata).length > 0;
  let meta = "";
  const prettyMeta = `\n${JSON.stringify(metadata, null, 2)}`;
  let ip = "";
  if (metaProvided) {
    switch (level as keyof typeof LOG_LEVELS) {
      case "error":
        meta = isError(metadata) ? `\n${metadata.stack}` : prettyMeta;
        break;
      case "request":
      case "response":
        if (containsIp(metadata)) {
          ip = ` (${C.underscore}${C.fg.black}${metadata.ip}${C.clear})`;
        }
        break;
      default:
        meta = prettyMeta;
        break;
    }
  }

  return `${C.dim}${timestamp}${C.clear} ${formattedLevel} [${C.fg.blue}${filename}${C.clear}]${ip}: ${message}${meta}`;
});

const jsonFormat = format.combine(format.json());

const defaultFileTransport = new DailyRotateFile({
  filename: "%DATE%",
  dirname: LOG_DIRECTORY,
  extension: ".log",
  maxFiles: "14d",
  format: jsonFormat,
});

const errorFileTransport = new transports.File({
  filename: `${LOG_DIRECTORY}/error.log`,
  level: "error",
  format: jsonFormat,
});

const baseLogger = createLogger({
  level: "debug",
  levels: LOG_LEVELS,
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    // Format the metadata object
    format.metadata({
      fillExcept: ["message", "level", "timestamp", "label"],
    }),
  ),
  transports: [defaultFileTransport, errorFileTransport],
}) as CustomLogger;

let consoleTransportAdded = false;

/** Gets the logger instance for the given source code file.
 *
 * @param filename The name of the source code file to create a logger for.
 * @returns The logger instance for the given source code file.
 * @example
 * const logger = getLogger(__filename);
 * logger.info("This is an info message.");
 * logger.error("This is an error message.", new Error("An error occurred."));
 */
export function getLogger(filename: string) {
  const label = path.basename(filename);
  const logger = baseLogger.child({ filename: label });

  const debugMode = process.env.NODE_ENV === "development";

  const useConsoleTransport =
    debugMode || process.env.LOG_TO_CONSOLE === "true";

  if (useConsoleTransport && !consoleTransportAdded) {
    consoleTransportAdded = true;
    logger.add(
      new transports.Console({
        format: format.combine(logFormat),
        level: process.env.LOG_LEVEL || (debugMode ? "debug" : "http"),
      }),
    );
  }
  return logger;
}
