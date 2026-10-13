const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const { clearDatabase } = require("./helpers/database");

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await pool.end();
});

const createStock = async (overrides = {}) => {
  const data = {
    symbol: "AAPL",
    exchange: "XNAS",
    name: "Apple Inc.",
    currency: "USD",
    ...overrides,
  };

  return request(app).post("/api/stocks").send(data);
};

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
    const response = await request(app).post("/api/stocks").send({
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
    });
  });
});
