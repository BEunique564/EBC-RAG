const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const LOG_JSON = process.env.LOG_JSON === "true" || !process.stdout.isTTY;

const LEVELS = { error: 0, warn: 1, info: 2, audit: 3, debug: 4 };

function timestamp() {
  return new Date().toISOString();
}

function structuredLog(level, message, meta = {}) {
  if (LEVELS[level] === undefined) level = "info";
  if (LEVELS[level] > (LEVELS[LOG_LEVEL] ?? 2)) return;

  const entry = { ts: timestamp(), level, message, ...meta };

  if (LOG_JSON) {
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const prefix = `[${entry.ts}] [${level.toUpperCase()}]`;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    process.stdout.write(`${prefix} ${message}${metaStr}\n`);
  }
}

export const logger = {
  error: (msg, meta) => structuredLog("error", msg, meta),
  warn: (msg, meta) => structuredLog("warn", msg, meta),
  info: (msg, meta) => structuredLog("info", msg, meta),
  audit: (msg, meta) => structuredLog("audit", msg, meta),
  debug: (msg, meta) => structuredLog("debug", msg, meta),
  child: (defaultMeta) => {
    const childLogger = {};
    for (const level of Object.keys(LEVELS)) {
      childLogger[level] = (msg, meta) => structuredLog(level, msg, { ...defaultMeta, ...meta });
    }
    return childLogger;
  }
};
