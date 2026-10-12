const pool = require("../config/db");
const logger = require("../utils/logger");

// Roughly one increment in this many also deletes expired rows, which keeps
// the table small without a background timer.
const CLEANUP_EVERY = 100;

// express-rate-limit store that keeps counters in PostgreSQL, so limits hold
// across every server instance instead of per process.
class PostgresRateLimitStore {
  constructor(prefix) {
    this.prefix = `${prefix}:`;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    // One atomic statement: starts a new window when the old one has expired,
    // otherwise adds a hit to the current window.
    const result = await pool.query(
      `INSERT INTO rate_limits (key, hits, reset_at)
       VALUES ($1, 1, NOW() + $2 * INTERVAL '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE
           WHEN rate_limits.reset_at <= NOW() THEN 1
           ELSE rate_limits.hits + 1
         END,
         reset_at = CASE
           WHEN rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at
           ELSE rate_limits.reset_at
         END
       RETURNING hits, reset_at`,
      [this.prefix + key, this.windowMs],
    );

    if (Math.random() < 1 / CLEANUP_EVERY) {
      pool
        .query("DELETE FROM rate_limits WHERE reset_at <= NOW()")
        .catch((error) => {
          logger.error({ err: error }, "Failed to clean up rate limits");
        });
    }

    const { hits, reset_at: resetTime } = result.rows[0];

    return {
      totalHits: hits,
      resetTime,
    };
  }

  async decrement(key) {
    await pool.query(
      `UPDATE rate_limits
       SET hits = GREATEST(hits - 1, 0)
       WHERE key = $1 AND reset_at > NOW()`,
      [this.prefix + key],
    );
  }

  async resetKey(key) {
    await pool.query("DELETE FROM rate_limits WHERE key = $1", [
      this.prefix + key,
    ]);
  }
}

module.exports = PostgresRateLimitStore;
