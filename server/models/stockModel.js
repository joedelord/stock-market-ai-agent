const pool = require("../config/db");

const getAllStocks = async () => {
  const result = await pool.query(
    `SELECT
      id,
      symbol,
      exchange,
      name,
      currency,
      is_active
    FROM stocks
    ORDER BY name ASC`,
  );

  return result.rows;
};

const getStockById = async (id) => {
  const result = await pool.query(
    `SELECT
      id,
      symbol,
      exchange,
      name,
      currency,
      is_active
    FROM stocks
    WHERE id = $1`,
    [id],
  );

  return result.rows[0];
};

const createStock = async ({ symbol, exchange, name, currency }) => {
  const result = await pool.query(
    `INSERT INTO stocks (
      symbol,
      exchange,
      name,
      currency
    )
    VALUES ($1, $2, $3, $4)
    RETURNING
      id,
      symbol,
      exchange,
      name,
      currency,
      is_active,
      created_at`,
    [symbol, exchange, name, currency],
  );

  return result.rows[0];
};

// Fetches the newest prices and returns them oldest first for charting.
const getStockPrices = async (stockId, limit = 100) => {
  const result = await pool.query(
    `SELECT
      price_time,
      interval_code,
      open,
      high,
      low,
      close,
      volume
    FROM stock_prices
    WHERE stock_id = $1
    ORDER BY price_time DESC
    LIMIT $2`,
    [stockId, limit],
  );

  return result.rows.reverse();
};

module.exports = {
  getAllStocks,
  getStockById,
  createStock,
  getStockPrices,
};
