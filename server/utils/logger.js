const pino = require("pino");

const isTest = process.env.NODE_ENV === "test";
const isDevelopment = process.env.NODE_ENV === "development";

// JSON lines in production (for log collectors), readable output in
// development, silent in tests. LOG_LEVEL overrides the level.
const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? "silent" : "info"),

  // Keeps session cookies out of the logs.
  redact: [
    "req.headers.cookie",
    "req.headers.authorization",
    'res.headers["set-cookie"]',
  ],

  transport: isDevelopment
    ? {
        target: "pino-pretty",
      }
    : undefined,
});

module.exports = logger;
