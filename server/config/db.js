const { Pool } = require("pg");

const logger = require("../utils/logger");

// DATABASE_URL is what most hosted PostgreSQL providers hand out; the
// separate DB_* variables are convenient for local development.
const connection = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

// Certificates are verified unless DB_SSL_REJECT_UNAUTHORIZED=false, which
// some providers with self-signed certificates require.
const ssl =
  process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
      }
    : undefined;

const pool = new Pool({
  ...connection,
  ssl,
});

pool.on("error", (error) => {
  logger.error({ err: error }, "Unexpected PostgreSQL pool error");
});

module.exports = pool;
