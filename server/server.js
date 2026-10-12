require("./config/env");

const app = require("./app");
const pool = require("./config/db");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 5000;
const SHUTDOWN_TIMEOUT_MS = 10000;

const server = app.listen(PORT, () => {
  logger.info(`Server running at http://localhost:${PORT}`);
});

// Stops accepting connections, lets in-flight requests finish, then closes
// the database pool. Hosting platforms send SIGTERM before stopping a
// container; SIGINT is Ctrl+C.
const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`);

  // Force exit if open connections keep the server from closing.
  setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "Error while closing server");
      process.exitCode = 1;
    }

    await pool.end();
  });
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
