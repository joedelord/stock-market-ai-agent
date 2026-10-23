require("../config/env");

const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const watchlistModel = require("../models/watchlistModel");

// The scheduler only fetches XNAS, XNYS and XHEL, so these stocks never
// spend market data API requests.
const MOCK_EXCHANGE = "MOCK";
const INTERVAL = "15min";
const INTERVAL_MS = 15 * 60 * 1000;
// Enough for the analysis to calculate both SMA20 and SMA50.
const POINT_COUNT = 100;

const MOCK_STOCKS = [
  {
    symbol: "RISE",
    name: "Mock Rising Oyj",
    currency: "EUR",
    startPrice: 20,
    trendPerPoint: 0.004,
    volatility: 0.006,
  },
  {
    symbol: "FALL",
    name: "Mock Falling Inc.",
    currency: "USD",
    startPrice: 150,
    trendPerPoint: -0.003,
    volatility: 0.008,
  },
  {
    symbol: "FLAT",
    name: "Mock Sideways Corp.",
    currency: "USD",
    startPrice: 75,
    trendPerPoint: 0,
    volatility: 0.012,
  },
];

// A seeded generator gives the same prices on every run.
const createRandom = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;

  return seed / 4294967296;
};

// Twelve Data style "YYYY-MM-DD HH:MM:SS" in UTC, as saveStockPrices expects.
const formatUtc = (time) =>
  new Date(time).toISOString().slice(0, 19).replace("T", " ");

const createPrices = ({ startPrice, trendPerPoint, volatility }, seed) => {
  const random = createRandom(seed);
  const latestTime = Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS;
  const prices = [];

  let close = startPrice;

  for (let index = 0; index < POINT_COUNT; index += 1) {
    const open = close;
    const change = trendPerPoint + (random() - 0.5) * 2 * volatility;

    close = open * (1 + change);

    const high = Math.max(open, close) * (1 + random() * volatility);
    const low = Math.min(open, close) * (1 - random() * volatility);

    prices.push({
      priceTime: formatUtc(latestTime - (POINT_COUNT - 1 - index) * INTERVAL_MS),
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      volume: String(Math.round(10_000 + random() * 90_000)),
    });
  }

  return prices;
};

const upsertMockStock = async ({ symbol, name, currency }) => {
  const result = await pool.query(
    `INSERT INTO stocks (
      symbol,
      exchange,
      name,
      currency
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (symbol, exchange)
    DO UPDATE SET
      name = EXCLUDED.name,
      currency = EXCLUDED.currency,
      is_active = TRUE
    RETURNING
      id`,
    [symbol, MOCK_EXCHANGE, name, currency],
  );

  return result.rows[0].id;
};

const getUserIdByEmail = async (email) => {
  const result = await pool.query(
    `SELECT
      id
    FROM users
    WHERE LOWER(email) = LOWER($1)`,
    [email],
  );

  return result.rows[0]?.id;
};

const seedMockData = async () => {
  try {
    const email = process.argv[2];
    const userId = email ? await getUserIdByEmail(email) : undefined;

    if (email && !userId) {
      console.error(`No user with email ${email}`);
      process.exitCode = 1;
      return;
    }

    for (const [index, mockStock] of MOCK_STOCKS.entries()) {
      const stockId = await upsertMockStock(mockStock);
      const prices = createPrices(mockStock, index + 1);

      // Timestamps move with the current time, so old mock prices are
      // removed instead of piling up between runs.
      await pool.query("DELETE FROM stock_prices WHERE stock_id = $1", [
        stockId,
      ]);

      await stockModel.saveStockPrices(stockId, INTERVAL, prices);

      const latest = prices.at(-1);
      // About a trading day (26 bars of 15 min) earlier.
      const previousDay = prices.at(-27);

      await stockModel.saveStockQuote(stockId, {
        priceTime: new Date(`${latest.priceTime}Z`).toISOString(),
        close: latest.close,
        previousClose: previousDay.close,
      });

      if (userId) {
        await watchlistModel.addWatchlistStock(userId, stockId);
      }

      console.log(
        `${mockStock.symbol} (${MOCK_EXCHANGE}): ${prices.length} prices, latest close ${latest.close}`,
      );
    }

    console.log(
      userId
        ? `Added the mock stocks to ${email}'s watchlist.`
        : "Pass an email to add the mock stocks to that user's watchlist.",
    );
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

seedMockData();
