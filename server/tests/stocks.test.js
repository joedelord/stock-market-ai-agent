const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

const STOCK_DATA = {
  symbol: "AAPL",
  exchange: "XNAS",
  name: "Apple Inc.",
  currency: "USD",
};

const loginAs = async (role) => {
  await createUserAccount({
    username: `test${role}`,
    email: `${role}@example.com`,
    password: "password123",
    role,
  });

  const agent = request.agent(app);

  await agent.post("/api/auth/login").send({
    email: `${role}@example.com`,
    password: "password123",
  });

  return agent;
};

let admin;

beforeEach(async () => {
  await clearDatabase();
  admin = await loginAs("admin");
});

afterAll(async () => {
  await pool.end();
});

const createStock = async (overrides = {}) => {
  return admin.post("/api/stocks").send({ ...STOCK_DATA, ...overrides });
};

describe("POST /api/stocks access", () => {
  test("rejects guests", async () => {
    const response = await request(app).post("/api/stocks").send(STOCK_DATA);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
  });

  test("rejects users and moderators", async () => {
    for (const role of ["user", "moderator"]) {
      const agent = await loginAs(role);

      const response = await agent.post("/api/stocks").send(STOCK_DATA);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Insufficient permissions" });
    }

    const result = await pool.query("SELECT id FROM stocks");

    expect(result.rows).toHaveLength(0);
  });
});

describe("Stocks API", () => {
  test("returns an empty stock list", async () => {
    const response = await request(app).get("/api/stocks");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      stocks: [],
    });
  });

  test("lists stocks in alphabetical order", async () => {
    await createStock({
      symbol: "MSFT",
      name: "Microsoft Corporation",
    });

    await createStock({
      symbol: "AAPL",
      name: "Apple Inc.",
    });

    const response = await request(app).get("/api/stocks");

    expect(response.status).toBe(200);
    expect(response.body.stocks).toHaveLength(2);

    expect(response.body.stocks.map((stock) => stock.symbol)).toEqual([
      "AAPL",
      "MSFT",
    ]);
  });

  test("returns a single stock by ID", async () => {
    const created = await createStock();
    const id = created.body.stock.id;

    const response = await request(app).get(`/api/stocks/${id}`);

    expect(response.status).toBe(200);

    expect(response.body.stock).toMatchObject({
      symbol: "AAPL",
      exchange: "XNAS",
      name: "Apple Inc.",
      currency: "USD",
    });
  });

  test("creates a new stock", async () => {
    const response = await createStock();

    expect(response.status).toBe(201);

    expect(response.body.stock).toMatchObject({
      symbol: "AAPL",
      exchange: "XNAS",
      name: "Apple Inc.",
      currency: "USD",
    });

    const result = await pool.query("SELECT * FROM stocks WHERE symbol = $1", [
      "AAPL",
    ]);

    expect(result.rows).toHaveLength(1);
  });

  test("normalizes symbol, exchange and currency", async () => {
    const response = await createStock({
      symbol: "aapl",
      exchange: "xnas",
      currency: "usd",
    });

    expect(response.status).toBe(201);

    expect(response.body.stock).toMatchObject({
      symbol: "AAPL",
      exchange: "XNAS",
      currency: "USD",
    });
  });

  test("rejects duplicate stocks", async () => {
    await createStock();

    const response = await createStock();

    expect(response.status).toBe(409);

    expect(response.body).toEqual({
      error: "Stock already exists",
    });
  });

  test("allows the same symbol on different exchanges", async () => {
    const first = await createStock();

    const second = await createStock({
      exchange: "XNYS",
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const result = await pool.query("SELECT * FROM stocks WHERE symbol = $1", [
      "AAPL",
    ]);

    expect(result.rows).toHaveLength(2);
  });

  test("rejects invalid stock data", async () => {
    const response = await createStock({
      symbol: "",
      currency: "INVALID",
    });

    expect(response.status).toBe(400);
  });

  test("rejects missing required fields", async () => {
    const response = await admin.post("/api/stocks").send({
      symbol: "AAPL",
    });

    expect(response.status).toBe(400);
  });

  test("returns 404 for a missing stock", async () => {
    const response = await request(app).get("/api/stocks/99999");

    expect(response.status).toBe(404);

    expect(response.body).toEqual({
      error: "Stock not found",
    });
  });

  test("rejects an invalid stock ID", async () => {
    const response = await request(app).get("/api/stocks/abc");

    expect(response.status).toBe(400);
  });

  test("returns stock price history in chronological order", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    await pool.query(
      `INSERT INTO stock_prices
       (stock_id, price_time, interval_code, close)
       VALUES
       ($1, '2026-10-01T16:00:00Z', '1day', 250.00),
       ($1, '2026-10-02T16:00:00Z', '1day', 255.00),
       ($1, '2026-10-03T16:00:00Z', '1day', 260.00)`,
      [stockId],
    );

    const response = await request(app)
      .get(`/api/stocks/${stockId}/prices`)
      .query({ limit: 2 });

    expect(response.status).toBe(200);
    expect(response.body.prices).toHaveLength(2);

    expect(response.body.prices.map((price) => Number(price.close))).toEqual([
      255, 260,
    ]);
  });

  test("rejects an invalid price history limit", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    const response = await request(app)
      .get(`/api/stocks/${stockId}/prices`)
      .query({ limit: 5000 });

    expect(response.status).toBe(400);
  });

  test("returns 404 for prices of a missing stock", async () => {
    const response = await request(app).get("/api/stocks/99999/prices");

    expect(response.status).toBe(404);
  });

  test("rejects unknown fields when creating a stock", async () => {
    const response = await createStock({
      is_active: false,
    });

    expect(response.status).toBe(400);

    const result = await pool.query("SELECT * FROM stocks");

    expect(result.rows).toHaveLength(0);
  });

  test("returns field details for invalid stock data", async () => {
    const response = await createStock({
      currency: "US",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");

    expect(response.body.details.map((detail) => detail.field)).toEqual([
      "body.currency",
    ]);
  });

  test("rejects stock IDs that are not positive", async () => {
    for (const id of [0, -1]) {
      const stockResponse = await request(app).get(`/api/stocks/${id}`);
      const pricesResponse = await request(app).get(
        `/api/stocks/${id}/prices`,
      );

      expect(stockResponse.status).toBe(400);
      expect(pricesResponse.status).toBe(400);
    }
  });

  test("accepts price history limits from 1 to 1000", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    for (const limit of [1, 1000]) {
      const response = await request(app)
        .get(`/api/stocks/${stockId}/prices`)
        .query({ limit });

      expect(response.status).toBe(200);
    }

    for (const limit of [0, 1001, 1.5, "abc"]) {
      const response = await request(app)
        .get(`/api/stocks/${stockId}/prices`)
        .query({ limit });

      expect(response.status).toBe(400);
    }
  });

  test("returns only the prices of the requested stock", async () => {
    const apple = await createStock();
    const microsoft = await createStock({
      symbol: "MSFT",
      name: "Microsoft Corporation",
    });

    await pool.query(
      `INSERT INTO stock_prices
       (stock_id, price_time, interval_code, close)
       VALUES
       ($1, '2026-10-01T16:00:00Z', '1day', 250.00),
       ($2, '2026-10-01T16:00:00Z', '1day', 500.00)`,
      [apple.body.stock.id, microsoft.body.stock.id],
    );

    const response = await request(app).get(
      `/api/stocks/${apple.body.stock.id}/prices`,
    );

    expect(response.status).toBe(200);

    expect(response.body.prices.map((price) => Number(price.close))).toEqual([
      250,
    ]);
  });

  test("returns the newest 100 prices by default", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    // Day n closes at 100 + n, so the newest 100 of 101 days close at 102-201.
    await pool.query(
      `INSERT INTO stock_prices
       (stock_id, price_time, interval_code, close)
       SELECT
         $1,
         TIMESTAMPTZ '2026-01-01T16:00:00Z' + n * INTERVAL '1 day',
         '1day',
         100 + n
       FROM generate_series(1, 101) AS n`,
      [stockId],
    );

    const response = await request(app).get(`/api/stocks/${stockId}/prices`);

    expect(response.status).toBe(200);
    expect(response.body.prices).toHaveLength(100);

    const closes = response.body.prices.map((price) => Number(price.close));

    expect(closes[0]).toBe(102);
    expect(closes[99]).toBe(201);
  });

  test("returns the stock with an empty price list", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    const response = await request(app).get(`/api/stocks/${stockId}/prices`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      stock: expect.objectContaining({
        id: stockId,
        symbol: "AAPL",
      }),
      prices: [],
      quote: null,
    });
  });

  test("returns the stored quote with its day change", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    await stockModel.saveStockQuote(stockId, {
      priceTime: "2026-10-12T19:45:00.000Z",
      close: 110,
      previousClose: 100,
    });

    const response = await request(app).get(`/api/stocks/${stockId}/prices`);

    expect(response.status).toBe(200);

    expect(response.body.quote).toMatchObject({
      price_time: "2026-10-12T19:45:00.000Z",
      close: "110.000000",
      previous_close: "100.000000",
    });

    expect(Number(response.body.quote.day_change)).toBe(10);
    expect(Number(response.body.quote.day_change_percent)).toBe(10);
  });
});

describe("saveStockPrices", () => {
  // Shaped like the bars returned by marketDataService.fetchStockPrices.
  const PRICES = [
    {
      priceTime: "2026-01-01 10:00:00",
      open: "250.10",
      high: "252.00",
      low: "249.50",
      close: "251.25",
      volume: "1200",
    },
    {
      priceTime: "2026-01-01 10:15:00",
      open: "251.25",
      high: "253.00",
      low: "251.00",
      close: "252.75",
      volume: null,
    },
  ];

  const getSavedPrices = async (stockId) => {
    const result = await pool.query(
      `SELECT
        price_time,
        interval_code,
        open,
        close,
        volume
      FROM stock_prices
      WHERE stock_id = $1
      ORDER BY price_time ASC`,
      [stockId],
    );

    return result.rows;
  };

  test("saves prices with times read as UTC", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    const savedCount = await stockModel.saveStockPrices(
      stockId,
      "15min",
      PRICES,
    );

    expect(savedCount).toBe(2);

    const rows = await getSavedPrices(stockId);

    expect(rows.map((row) => row.price_time.toISOString())).toEqual([
      "2026-01-01T10:00:00.000Z",
      "2026-01-01T10:15:00.000Z",
    ]);

    expect(rows[0]).toMatchObject({
      interval_code: "15min",
      open: "250.100000",
      close: "251.250000",
      volume: "1200",
    });

    expect(rows[1].volume).toBeNull();
  });

  test("updates existing prices instead of duplicating them", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    await stockModel.saveStockPrices(stockId, "15min", PRICES);

    const savedCount = await stockModel.saveStockPrices(stockId, "15min", [
      { ...PRICES[0], close: "260.00" },
    ]);

    expect(savedCount).toBe(1);

    const rows = await getSavedPrices(stockId);

    expect(rows).toHaveLength(2);
    expect(rows[0].close).toBe("260.000000");
  });

  test("saves nothing when one price is invalid", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    await expect(
      stockModel.saveStockPrices(stockId, "15min", [
        PRICES[0],
        { ...PRICES[1], close: "0" },
      ]),
    ).rejects.toThrow();

    expect(await getSavedPrices(stockId)).toEqual([]);
  });

  test("saves nothing for an empty price list", async () => {
    const created = await createStock();

    const savedCount = await stockModel.saveStockPrices(
      created.body.stock.id,
      "15min",
      [],
    );

    expect(savedCount).toBe(0);
  });
});

describe("saveStockQuote", () => {
  const QUOTE = {
    priceTime: "2026-10-12T19:45:00.000Z",
    close: 341.06,
    previousClose: 335,
  };

  test("saves a quote and replaces it with a newer one", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    await stockModel.saveStockQuote(stockId, QUOTE);

    const saved = await stockModel.saveStockQuote(stockId, {
      priceTime: "2026-10-12T20:00:00.000Z",
      close: 342,
      previousClose: 335,
    });

    expect(saved).toMatchObject({ close: "342.000000" });

    const quote = await stockModel.getStockQuote(stockId);

    expect(quote.price_time.toISOString()).toBe("2026-10-12T20:00:00.000Z");
    expect(quote.close).toBe("342.000000");
  });

  test("does not overwrite a newer quote with an older one", async () => {
    const created = await createStock();
    const stockId = created.body.stock.id;

    await stockModel.saveStockQuote(stockId, QUOTE);

    const saved = await stockModel.saveStockQuote(stockId, {
      priceTime: "2026-10-12T19:30:00.000Z",
      close: 300,
      previousClose: 335,
    });

    expect(saved).toBeUndefined();

    const quote = await stockModel.getStockQuote(stockId);

    expect(quote.price_time.toISOString()).toBe("2026-10-12T19:45:00.000Z");
    expect(quote.close).toBe("341.060000");
  });

  test("returns undefined when the stock has no quote", async () => {
    const created = await createStock();

    const quote = await stockModel.getStockQuote(created.body.stock.id);

    expect(quote).toBeUndefined();
  });
});
