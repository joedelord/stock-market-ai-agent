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
// Without an interval, the limit counts rows of every interval together.
const getStockPrices = async (stockId, limit = 100, interval = null) => {
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
      AND ($3::text IS NULL OR interval_code = $3)
    ORDER BY price_time DESC
    LIMIT $2`,
    [stockId, limit, interval],
  );

  return result.rows.reverse();
};

// Twelve Data returns UTC times without an offset, so they are read as UTC
// explicitly instead of in the session time zone. A single statement keeps
// the import all-or-nothing. Returns the number of inserted or updated rows.
const saveStockPrices = async (stockId, interval, prices) => {
  if (!Array.isArray(prices)) {
    throw new TypeError("Prices must be an array");
  }

  if (prices.length === 0) {
    return 0;
  }

  const result = await pool.query(
    `INSERT INTO stock_prices (
      stock_id,
      price_time,
      interval_code,
      open,
      high,
      low,
      close,
      volume
    )
    SELECT
      $1,
      price.price_time AT TIME ZONE 'UTC',
      $2,
      price.open,
      price.high,
      price.low,
      price.close,
      price.volume
    FROM UNNEST(
      $3::timestamp[],
      $4::numeric[],
      $5::numeric[],
      $6::numeric[],
      $7::numeric[],
      $8::bigint[]
    ) AS price(
      price_time,
      open,
      high,
      low,
      close,
      volume
    )
    ON CONFLICT (stock_id, interval_code, price_time)
    DO UPDATE SET
      open = EXCLUDED.open,
      high = EXCLUDED.high,
      low = EXCLUDED.low,
      close = EXCLUDED.close,
      volume = EXCLUDED.volume`,
    [
      stockId,
      interval,
      prices.map((price) => price.priceTime),
      prices.map((price) => price.open),
      prices.map((price) => price.high),
      prices.map((price) => price.low),
      prices.map((price) => price.close),
      prices.map((price) => price.volume),
    ],
  );

  return result.rowCount;
};

// The WHERE clause keeps an older quote from overwriting a newer stored one;
// then nothing is returned.
const saveStockQuote = async (stockId, quote) => {
  const result = await pool.query(
    `INSERT INTO stock_quotes (
      stock_id,
      price_time,
      close,
      previous_close,
      fetched_at
    )
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (stock_id)
    DO UPDATE SET
      price_time = EXCLUDED.price_time,
      close = EXCLUDED.close,
      previous_close = EXCLUDED.previous_close,
      fetched_at = EXCLUDED.fetched_at
    WHERE EXCLUDED.price_time >= stock_quotes.price_time
    RETURNING
      stock_id,
      price_time,
      close,
      previous_close,
      fetched_at`,
    [stockId, quote.priceTime, quote.close, quote.previousClose],
  );

  return result.rows[0];
};

const getStockQuote = async (stockId) => {
  const result = await pool.query(
    `SELECT
      stock_id,
      price_time,
      close,
      previous_close,
      close - previous_close AS day_change,
      ((close - previous_close) / previous_close) * 100
        AS day_change_percent,
      fetched_at
    FROM stock_quotes
    WHERE stock_id = $1`,
    [stockId],
  );

  return result.rows[0];
};

// Only stocks someone follows or has an active alert on are fetched, so
// unused catalog entries don't spend market data API requests.
const getTrackedStocks = async () => {
  const result = await pool.query(
    `SELECT
      s.id,
      s.symbol,
      s.exchange,
      s.name,
      s.currency,
      s.is_active
    FROM stocks s
    WHERE s.is_active = TRUE
      AND (
        EXISTS (
          SELECT 1
          FROM user_stocks us
          WHERE us.stock_id = s.id
        )
        OR EXISTS (
          SELECT 1
          FROM stock_alerts a
          WHERE a.stock_id = s.id
            AND a.is_active = TRUE
        )
      )
    ORDER BY s.name ASC, s.id ASC`,
  );

  return result.rows;
};

module.exports = {
  getAllStocks,
  getTrackedStocks,
  getStockById,
  createStock,
  getStockPrices,
  saveStockPrices,
  saveStockQuote,
  getStockQuote,
};
