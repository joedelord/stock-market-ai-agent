require("./config/env");

const cron = require("node-cron");

const pool = require("./config/db");
const logger = require("./utils/logger");
const { updateStockPrices } = require("./jobs/updateStockPrices");

// Every 15 minutes on weekdays, 07:00-21:59 UTC. This covers Helsinki
// (opens 07:00/08:00 UTC) and New York (closes 20:00/21:00 UTC) in both
// summer and winter time, without spending API credits while all markets
// are closed. The free Twelve Data plan allows 800 requests per day, and
// each run makes one request per active stock (60 runs per day).
const SCHEDULE = "*/15 7-21 * * 1-5";

// Long enough for one Twelve Data request (15 s timeout) and its save.
const SHUTDOWN_TIMEOUT_MS = 20000;

const shutdownController = new AbortController();

let currentRun = null;

const updatePrices = async () => {
  try {
    const results = await updateStockPrices({
      signal: shutdownController.signal,
    });

    const failed = results.filter((result) => result.status === "error");

    for (const { symbol, exchange, error } of failed) {
      logger.warn({ symbol, exchange, error }, "Price update failed");
    }

    logger.info(
      { updated: results.length - failed.length, failed: failed.length },
      "Stock prices updated",
    );
  } catch (error) {
    logger.error({ err: error }, "Price update run failed");
  }
};

// The running update is kept so shutdown can wait for it. That also makes
// it the overlap guard: a run with many stocks can take longer than 15
// minutes because of the delay between requests.
const runUpdate = () => {
  if (currentRun) {
    logger.warn("Previous price update still running, skipping");
    return currentRun;
  }

  currentRun = updatePrices().finally(() => {
    currentRun = null;
  });

  return currentRun;
};

const task = cron.schedule(SCHEDULE, runUpdate, { timezone: "UTC" });

logger.info({ schedule: SCHEDULE }, "Market scheduler started");

runUpdate();

// Stops scheduling, lets the current stock finish, then closes the database
// pool so no query runs against a closed pool.
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down`);

  // Force exit if the current request hangs.
  setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  task.stop();
  shutdownController.abort();

  await currentRun;
  await pool.end();
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
