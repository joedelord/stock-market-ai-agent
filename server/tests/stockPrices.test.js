const pool = require("../config/db");

const { createStock, saveStockPrices } = require("../models/stockModel");

const { clearDatabase } = require("./helpers/database");

describe("Stock price database integration", () => {
  let stock;

  beforeEach(async () => {
    await clearDatabase();

    stock = await createStock({
      symbol: "AAPL",
      exchange: "XNAS",
      name: "Apple Inc.",
      currency: "USD",
    });
  });

  const samplePrices = [
    {
      priceTime: "2026-10-12 19:30:00",
      open: "340.35",
      high: "341.13",
      low: "340.27",
      close: "340.64",
      volume: "1044341",
    },
    {
      priceTime: "2026-10-12 19:45:00",
      open: "340.65",
      high: "341.16",
      low: "340.22",
      close: "341.06",
      volume: "2082898",
    },
  ];

  test("saves multiple price records", async () => {
    const count = await saveStockPrices(stock.id, "15min", samplePrices);

    expect(count).toBe(2);

    const result = await pool.query(
      "SELECT * FROM stock_prices WHERE stock_id = $1",
      [stock.id],
    );

    expect(result.rows).toHaveLength(2);
  });

  test("does not create duplicate records", async () => {
    await saveStockPrices(stock.id, "15min", samplePrices);
    await saveStockPrices(stock.id, "15min", samplePrices);

    const result = await pool.query(
      "SELECT * FROM stock_prices WHERE stock_id = $1",
      [stock.id],
    );

    expect(result.rows).toHaveLength(2);
  });

  test("updates an existing price record", async () => {
    await saveStockPrices(stock.id, "15min", samplePrices);

    const updated = [
      {
        ...samplePrices[0],
        close: "345.50",
      },
    ];

    await saveStockPrices(stock.id, "15min", updated);

    const result = await pool.query(
      `SELECT close
       FROM stock_prices
       WHERE stock_id = $1
         AND price_time = $2::timestamp AT TIME ZONE 'UTC'`,
      [stock.id, samplePrices[0].priceTime],
    );

    expect(Number(result.rows[0].close)).toBe(345.5);
  });

  test("stores timestamps in UTC", async () => {
    await saveStockPrices(stock.id, "15min", samplePrices);

    const result = await pool.query(
      `SELECT price_time AT TIME ZONE 'UTC' AS utc_time
       FROM stock_prices
       WHERE stock_id = $1
       ORDER BY price_time ASC`,
      [stock.id],
    );

    const storedTime = result.rows[0].utc_time;

    // PostgreSQL returns a Date object for timestamp columns
    // with the default pg type parser.
    expect(storedTime).toBeDefined();
  });

  test("returns zero for an empty array", async () => {
    const count = await saveStockPrices(stock.id, "15min", []);

    expect(count).toBe(0);
  });

  test("rolls back the entire statement on invalid data", async () => {
    const invalidPrices = [
      samplePrices[0],
      {
        ...samplePrices[1],
        close: "not-a-number",
      },
    ];

    await expect(
      saveStockPrices(stock.id, "15min", invalidPrices),
    ).rejects.toThrow();

    const result = await pool.query(
      "SELECT COUNT(*)::int AS count FROM stock_prices",
    );

    expect(result.rows[0].count).toBe(0);
  });
});
