const pool = require("../config/db");

// Queues one digest for each user who wants it, can receive it and follows
// at least one active stock. ON CONFLICT makes repeated runs on the same day
// harmless. Returns the number of digests queued by this call.
const createDailyDigests = async (digestDate) => {
  const result = await pool.query(
    `INSERT INTO daily_digests (
      user_id,
      digest_date
    )
    SELECT
      u.id,
      $1::date
    FROM users u
    WHERE u.email_digest_enabled
      AND u.email_verified_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM user_stocks us
        JOIN stocks s ON s.id = us.stock_id
        WHERE us.user_id = u.id
          AND s.is_active
      )
    ON CONFLICT (user_id, digest_date) DO NOTHING`,
    [digestDate],
  );

  return result.rowCount;
};

// The stocks that the digests this run can send will describe, so each one
// is analysed once however many users follow it. Digests still waiting for
// a retry are left out, so a run with nothing to send does no work.
const getPendingDigestStocks = async ({ digestDate, retryDelayMs }) => {
  const result = await pool.query(
    `SELECT DISTINCT
      s.id,
      s.symbol,
      s.exchange,
      s.name,
      s.currency,
      s.is_active
    FROM daily_digests d
    JOIN user_stocks us ON us.user_id = d.user_id
    JOIN stocks s ON s.id = us.stock_id
    WHERE d.digest_date = $1
      AND d.status = 'pending'
      AND (
        d.last_attempt_at IS NULL
        OR d.last_attempt_at <= NOW() - $2 * INTERVAL '1 millisecond'
      )
      AND s.is_active
    ORDER BY s.id`,
    [digestDate, retryDelayMs],
  );

  return result.rows;
};

// Claims one pending digest and counts the attempt before it is sent, so a
// concurrent run skips it and a crash mid-send still uses up an attempt.
const claimDailyDigest = async ({ digestDate, retryDelayMs }) => {
  const result = await pool.query(
    `WITH claimed AS (
      UPDATE daily_digests
      SET
        attempts = attempts + 1,
        last_attempt_at = NOW()
      WHERE (user_id, digest_date) = (
        SELECT
          user_id,
          digest_date
        FROM daily_digests
        WHERE digest_date = $1
          AND status = 'pending'
          AND (
            last_attempt_at IS NULL
            OR last_attempt_at <= NOW() - $2 * INTERVAL '1 millisecond'
          )
        ORDER BY user_id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        user_id,
        digest_date,
        attempts
    )
    SELECT
      claimed.user_id,
      claimed.attempts,
      users.email,
      users.email_verified_at,
      users.email_digest_enabled
    FROM claimed
    JOIN users ON users.id = claimed.user_id`,
    [digestDate, retryDelayMs],
  );

  return result.rows[0];
};

const setDailyDigestStatus = async (userId, digestDate, status) => {
  await pool.query(
    `UPDATE daily_digests
    SET
      status = $3
    WHERE user_id = $1
      AND digest_date = $2`,
    [userId, digestDate, status],
  );
};

// Gives up once the digest has used all its attempts. Otherwise it stays
// pending for the next run.
const recordDailyDigestFailure = async (userId, digestDate, maxAttempts) => {
  await pool.query(
    `UPDATE daily_digests
    SET
      status = 'failed'
    WHERE user_id = $1
      AND digest_date = $2
      AND attempts >= $3`,
    [userId, digestDate, maxAttempts],
  );
};

// A summary of an earlier market day is no longer worth sending.
const expireDailyDigests = async (digestDate) => {
  const result = await pool.query(
    `UPDATE daily_digests
    SET
      status = 'failed'
    WHERE status = 'pending'
      AND digest_date < $1`,
    [digestDate],
  );

  return result.rowCount;
};

const deleteOldDailyDigests = async (maxAgeMs) => {
  const result = await pool.query(
    `DELETE FROM daily_digests
    WHERE created_at <= NOW() - $1 * INTERVAL '1 millisecond'`,
    [maxAgeMs],
  );

  return result.rowCount;
};

module.exports = {
  createDailyDigests,
  getPendingDigestStocks,
  claimDailyDigest,
  setDailyDigestStatus,
  recordDailyDigestFailure,
  expireDailyDigests,
  deleteOldDailyDigests,
};
