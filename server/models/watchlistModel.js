const pool = require("../config/db");

const getWatchlistStocks = async (userId) => {
  const result = await pool.query(
    `SELECT
      s.id,
      s.symbol,
      s.exchange,
      s.name,
      s.currency,
      s.is_active
    FROM user_stocks us
    JOIN stocks s ON s.id = us.stock_id
    WHERE us.user_id = $1
    ORDER BY s.name ASC, s.id ASC`,
    [userId],
  );

  return result.rows;
};

// ON CONFLICT keeps repeated and concurrent follows from failing.
// Returns undefined when the stock was already followed.
const addWatchlistStock = async (userId, stockId) => {
  const result = await pool.query(
    `INSERT INTO user_stocks (
      user_id,
      stock_id
    )
    VALUES ($1, $2)
    ON CONFLICT (user_id, stock_id) DO NOTHING
    RETURNING
      stock_id`,
    [userId, stockId],
  );

  return result.rows[0];
};

const removeWatchlistStock = async (userId, stockId) => {
  await pool.query(
    `DELETE FROM user_stocks
    WHERE user_id = $1
      AND stock_id = $2`,
    [userId, stockId],
  );
};

module.exports = {
  getWatchlistStocks,
  addWatchlistStock,
  removeWatchlistStock,
};
