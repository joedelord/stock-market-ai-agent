const pool = require("../config/db");
const HttpError = require("../utils/httpError");

const MAX_ALERTS_PER_USER = 50;
const CONFLICT = 409;

const getAlerts = async (userId) => {
  const result = await pool.query(
    `SELECT
      a.id,
      a.stock_id,
      a.alert_type,
      a.threshold,
      a.repeat_mode,
      a.is_active,
      a.last_triggered_at,
      a.created_at,
      a.updated_at,
      s.symbol,
      s.name,
      s.exchange,
      s.currency
    FROM stock_alerts a
    JOIN stocks s ON s.id = a.stock_id
    WHERE a.user_id = $1
    ORDER BY a.id DESC`,
    [userId],
  );

  return result.rows;
};

// The user row lock makes concurrent requests count one at a time, so they
// cannot pass the limit together. Selecting from stocks checks that the
// stock exists and is active; returns undefined otherwise.
const createAlert = async (
  userId,
  { stockId, alertType, threshold, repeatMode },
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
      userId,
    ]);

    const countResult = await client.query(
      `SELECT
        COUNT(*)::int AS count
      FROM stock_alerts
      WHERE user_id = $1`,
      [userId],
    );

    if (countResult.rows[0].count >= MAX_ALERTS_PER_USER) {
      throw new HttpError(
        CONFLICT,
        `You can have at most ${MAX_ALERTS_PER_USER} alerts`,
      );
    }

    const result = await client.query(
      `INSERT INTO stock_alerts (
        user_id,
        stock_id,
        alert_type,
        threshold,
        repeat_mode
      )
      SELECT $1, id, $3, $4, $5
      FROM stocks
      WHERE id = $2
        AND is_active = TRUE
      RETURNING
        id,
        stock_id,
        alert_type,
        threshold,
        repeat_mode,
        is_active,
        last_triggered_at,
        created_at,
        updated_at`,
      [userId, stockId, alertType, threshold, repeatMode],
    );

    await client.query("COMMIT");

    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Fields left out of the request keep their current values. A new rule, or
// resuming a paused alert, clears the trigger date so it can fire again
// today. updated_at is set by the stock_alerts_set_updated_at trigger.
const updateAlert = async (
  userId,
  id,
  { alertType, threshold, repeatMode, isActive },
) => {
  const result = await pool.query(
    `UPDATE stock_alerts
    SET
      alert_type = COALESCE($3, alert_type),
      threshold = COALESCE($4, threshold),
      repeat_mode = COALESCE($5, repeat_mode),
      is_active = COALESCE($6, is_active),
      last_triggered_market_date = CASE
        WHEN $3::text IS NOT NULL OR ($6::boolean AND NOT is_active) THEN NULL
        ELSE last_triggered_market_date
      END
    WHERE id = $2
      AND user_id = $1
    RETURNING
      id,
      stock_id,
      alert_type,
      threshold,
      repeat_mode,
      is_active,
      last_triggered_at,
      created_at,
      updated_at`,
    [
      userId,
      id,
      alertType ?? null,
      threshold ?? null,
      repeatMode ?? null,
      isActive ?? null,
    ],
  );

  return result.rows[0];
};

const deleteAlert = async (userId, id) => {
  const result = await pool.query(
    `DELETE FROM stock_alerts
    WHERE id = $2
      AND user_id = $1
    RETURNING
      id`,
    [userId, id],
  );

  return result.rows[0];
};

// Marks every active alert of the stock that the price meets and that has
// not fired on this market day, and records a notification for each, in
// one transaction. The UPDATE locks the alert rows, so a concurrent run
// sees the new trigger date and skips them. A once alert is switched off.
// buildMessage receives each triggered alert and returns its text.
const triggerAlerts = async (
  stockId,
  { price, previousClose, priceTime, marketDate },
  buildMessage,
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const triggered = await client.query(
      `WITH latest AS (
        SELECT
          $2::numeric AS price,
          ($2::numeric - $3::numeric) / $3::numeric * 100 AS daily_change
      )
      UPDATE stock_alerts a
      SET
        is_active = (a.repeat_mode = 'daily'),
        last_triggered_at = NOW(),
        last_triggered_market_date = $4
      FROM latest
      WHERE a.stock_id = $1
        AND a.is_active = TRUE
        AND a.last_triggered_market_date IS DISTINCT FROM $4
        AND (
          (a.alert_type = 'price_above' AND latest.price >= a.threshold)
          OR (a.alert_type = 'price_below' AND latest.price <= a.threshold)
          OR (
            a.alert_type = 'daily_change_above'
            AND latest.daily_change >= a.threshold
          )
          OR (
            a.alert_type = 'daily_change_below'
            AND latest.daily_change <= a.threshold
          )
        )
      RETURNING
        a.id,
        a.user_id,
        a.alert_type,
        a.threshold,
        latest.daily_change`,
      [stockId, price, previousClose, marketDate],
    );

    const alerts = triggered.rows;

    if (alerts.length === 0) {
      await client.query("COMMIT");
      return [];
    }

    // The CTE joins the inserted rows to users, so the caller can email them.
    const result = await client.query(
      `WITH inserted AS (
        INSERT INTO notifications (
          user_id,
          alert_id,
          message,
          price,
          daily_change_percent,
          price_time,
          market_date
        )
        SELECT
          notification.user_id,
          notification.alert_id,
          notification.message,
          $4,
          notification.daily_change_percent,
          $5,
          $6
        FROM UNNEST(
          $1::int[],
          $2::bigint[],
          $3::text[],
          $7::numeric[]
        ) AS notification(
          user_id,
          alert_id,
          message,
          daily_change_percent
        )
        RETURNING
          id,
          user_id,
          alert_id,
          message
      )
      SELECT
        inserted.id,
        inserted.user_id,
        inserted.alert_id,
        inserted.message,
        users.email
      FROM inserted
      JOIN users ON users.id = inserted.user_id
      ORDER BY inserted.id`,
      [
        alerts.map((alert) => alert.user_id),
        alerts.map((alert) => alert.id),
        alerts.map((alert) => buildMessage(alert)),
        price,
        priceTime,
        marketDate,
        alerts.map((alert) => alert.daily_change),
      ],
    );

    await client.query("COMMIT");

    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  MAX_ALERTS_PER_USER,
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  triggerAlerts,
};
