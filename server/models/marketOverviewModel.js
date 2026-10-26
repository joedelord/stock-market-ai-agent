const pool = require("../config/db");

// Follows are counted before joining quotes, so each stock occurs once.
const getOverviewStocks = async (exchanges) => {
  const result = await pool.query(
    `SELECT
      s.id,
      s.symbol,
      s.name,
      s.exchange,
      s.currency,
      q.close,
      q.price_time,
      (q.close - q.previous_close) / NULLIF(q.previous_close, 0) * 100
        AS day_change_percent,
      COALESCE(f.follower_count, 0)::integer AS follower_count
    FROM stocks s
    LEFT JOIN stock_quotes q ON q.stock_id = s.id
    LEFT JOIN (
      SELECT
        stock_id,
        COUNT(*) AS follower_count
      FROM user_stocks
      GROUP BY stock_id
    ) f ON f.stock_id = s.id
    WHERE s.is_active = TRUE
      AND s.exchange = ANY($1)`,
    [exchanges],
  );

  return result.rows;
};

module.exports = {
  getOverviewStocks,
};
