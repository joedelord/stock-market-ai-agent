require("../config/env");

const pool = require("../config/db");
const logger = require("../utils/logger");
const { createMarketScheduler } = require("../jobs/marketScheduler");

// Long enough for one Twelve Data request (15 s timeout) and its save.
const SHUTDOWN_TIMEOUT_MS = 20000;

const startMarketScheduler = async () => {
  const scheduler = createMarketScheduler();

  // Lets the current stock finish, then closes the database pool so no
  // query runs against a closed pool.
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);

    // Force exit if the current request or query hangs.
    setTimeout(() => {
      logger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    try {
      await scheduler.stop();
      await pool.end();
    } catch (error) {
      logger.error({ err: error }, "Shutdown failed");
      process.exitCode = 1;
    }
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  try {
    await scheduler.start();
  } catch (error) {
    logger.error({ err: error }, "Market scheduler failed to start");
    process.exitCode = 1;

    await shutdown("startup failure");
  }
};

startMarketScheduler();
