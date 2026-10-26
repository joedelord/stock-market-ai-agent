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

module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  updateNotification,
  markAllNotificationsRead,
};
