const logger = require("../utils/logger");

const HEARTBEAT_TIMEOUT_MS = 10_000;

// The scheduler has no HTTP endpoint for an uptime monitor. It pings
// HEARTBEAT_URL (for example a healthchecks.io check) after each daily
// cleanup, and the service alerts when a ping is late. The URL is never
// logged, because it is the check's only secret.
const pingHeartbeat = async () => {
  const url = process.env.HEARTBEAT_URL?.trim();

  if (!url) return;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Heartbeat ping failed");
    }
  } catch (error) {
    logger.warn({ reason: error.message }, "Heartbeat ping failed");
  }
};

module.exports = {
  pingHeartbeat,
};
