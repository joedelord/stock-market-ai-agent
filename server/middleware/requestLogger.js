const crypto = require("crypto");
const pinoHttp = require("pino-http");

const logger = require("../utils/logger");

// Reuses an incoming X-Request-Id from a proxy when it looks safe, so one
// request can be followed across services; otherwise generates one.
const REQUEST_ID_PATTERN = /^[\w-]{1,100}$/;

const requestLogger = pinoHttp({
  logger,

  genReqId: (req, res) => {
    const incomingId = req.headers["x-request-id"];

    const id =
      typeof incomingId === "string" && REQUEST_ID_PATTERN.test(incomingId)
        ? incomingId
        : crypto.randomUUID();

    res.setHeader("X-Request-Id", id);

    return id;
  },

  // Keeps each line short; headers are left out entirely.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },

  customLogLevel: (req, res, error) => {
    if (error || res.statusCode >= 500) {
      return "error";
    }

    if (res.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },

  // Load balancers call the health check constantly.
  autoLogging: {
    ignore: (req) => req.url === "/api/health",
  },
});

module.exports = requestLogger;
