const pool = require("../config/db");

const getNotifications = async (userId, limit) => {
  const result = await pool.query(
    `SELECT
      id,
      alert_id,
      message,
      price,
      daily_change_percent,
      price_time,
      market_date,
      created_at,
      read_at
    FROM notifications
    WHERE user_id = $1
    ORDER BY id DESC
    LIMIT $2`,
    [userId, limit],
  );

  return result.rows;
};

const getUnreadNotificationCount = async (userId) => {
  const result = await pool.query(
    `SELECT
      COUNT(*)::int AS count
    FROM notifications
    WHERE user_id = $1
      AND read_at IS NULL`,
    [userId],
  );

  return result.rows[0].count;
};

// Marking an already read notification keeps its original read time.
const updateNotification = async (userId, id, read) => {
  const result = await pool.query(
    `UPDATE notifications
    SET
      read_at = CASE WHEN $3 THEN COALESCE(read_at, NOW()) ELSE NULL END
    WHERE id = $2
      AND user_id = $1
    RETURNING
      id,
      alert_id,
      message,
      price,
      daily_change_percent,
      price_time,
      market_date,
      created_at,
      read_at`,
    [userId, id, read],
  );

  return result.rows[0];
};

// Returns the number of notifications that were unread.
const markAllNotificationsRead = async (userId) => {
  const result = await pool.query(
    `UPDATE notifications
    SET
      read_at = NOW()
    WHERE user_id = $1
      AND read_at IS NULL`,
    [userId],
  );

  return result.rowCount;
};

// Claims the oldest pending alert email and counts the attempt before it is
// sent, so a concurrent run skips it and a crash mid-send still uses up an
// attempt. A failed email waits retryDelayMs before it is claimed again.
// notificationIds limits the claim to those notifications (null for any).
const claimAlertEmail = async ({ notificationIds, maxAgeMs, retryDelayMs }) => {
  const result = await pool.query(
    `WITH claimed AS (
      UPDATE notifications
      SET
        email_attempts = email_attempts + 1,
        email_last_attempt_at = NOW()
      WHERE id = (
        SELECT
          id
        FROM notifications
        WHERE email_status = 'pending'
          AND created_at > NOW() - $1 * INTERVAL '1 millisecond'
          AND (
            email_last_attempt_at IS NULL
            OR email_last_attempt_at <= NOW() - $2 * INTERVAL '1 millisecond'
          )
          AND ($3::bigint[] IS NULL OR id = ANY($3::bigint[]))
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        user_id,
        message,
        email_attempts
    )
    SELECT
      claimed.id,
      claimed.user_id,
      claimed.message,
      claimed.email_attempts,
      users.email,
      users.email_verified_at,
      users.email_alerts_enabled
    FROM claimed
    JOIN users ON users.id = claimed.user_id`,
    [maxAgeMs, retryDelayMs, notificationIds],
  );

  return result.rows[0];
};

const markAlertEmailSent = async (id) => {
  await pool.query(
    `UPDATE notifications
    SET
      email_status = 'sent'
    WHERE id = $1`,
    [id],
  );
};

// For a user who turned alert emails off after the alert fired.
const cancelAlertEmail = async (id) => {
  await pool.query(
    `UPDATE notifications
    SET
      email_status = 'none'
    WHERE id = $1`,
    [id],
  );
};

// Gives up on the email once it has used all its attempts. Otherwise it stays
// pending for the next retry.
const recordAlertEmailFailure = async (id, maxAttempts) => {
  await pool.query(
    `UPDATE notifications
    SET
      email_status = 'failed'
    WHERE id = $1
      AND email_attempts >= $2`,
    [id, maxAttempts],
  );
};

// An alert that is a day old is no longer worth emailing.
const expireAlertEmails = async (maxAgeMs) => {
  const result = await pool.query(
    `UPDATE notifications
    SET
      email_status = 'failed'
    WHERE email_status = 'pending'
      AND created_at <= NOW() - $1 * INTERVAL '1 millisecond'`,
    [maxAgeMs],
  );

  return result.rowCount;
};

const deleteOldNotifications = async (maxAgeMs) => {
  const result = await pool.query(
    `DELETE FROM notifications
    WHERE created_at <= NOW() - $1 * INTERVAL '1 millisecond'`,
    [maxAgeMs],
  );

  return result.rowCount;
};

module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  updateNotification,
  markAllNotificationsRead,
  claimAlertEmail,
  markAlertEmailSent,
  cancelAlertEmail,
  recordAlertEmailFailure,
  expireAlertEmails,
  deleteOldNotifications,
};
