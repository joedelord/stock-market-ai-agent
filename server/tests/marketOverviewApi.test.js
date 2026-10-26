const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const watchlistModel = require("../models/watchlistModel");
const { clearDatabase } = require("./helpers/database");

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await pool.end();
});

const createStock = async ({ symbol, exchange = "XNAS", close, previousClose }) => {
  const stock = await stockModel.createStock({
    symbol,
    exchange,
    name: `${symbol} Corp.`,
    currency: "USD",
  });

  if (close) {
    await stockModel.saveStockQuote(stock.id, {
      priceTime: "2026-10-23T14:00:00Z",
      close,
      previousClose,
    });
  }

  return stock;
};

const createUser = async (index) => {
  const result = await pool.query(
    `INSERT INTO users (
      username,
      email,
      password_hash
    )
    VALUES ($1, $2, $3)
    RETURNING
      id`,
    [`user${index}`, `user${index}@example.com`, "not-a-real-hash"],
  );

  return result.rows[0].id;
};

const follow = async (stock, followerCount) => {
  for (let index = 0; index < followerCount; index += 1) {
    const userId = await createUser(`${stock.symbol}${index}`);

    await watchlistModel.addWatchlistStock(userId, stock.id);
  }
};

describe("Market overview API", () => {
  test("is public and not captured by the stock ID route", async () => {
    const response = await request(app).get("/api/stocks/overview");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      gainers: [],
      losers: [],
      mostFollowed: [],
    });
  });

  test("ranks gainers and losers from stored quotes", async () => {
    await createStock({ symbol: "UP", close: "110", previousClose: "100" });
    await createStock({ symbol: "DOWN", close: "95", previousClose: "100" });

    const response = await request(app).get("/api/stocks/overview");

    expect(response.status).toBe(200);
    expect(response.body.gainers.map((stock) => stock.symbol)).toEqual(["UP"]);
    expect(Number(response.body.gainers[0].day_change_percent)).toBe(10);
    expect(response.body.losers.map((stock) => stock.symbol)).toEqual([
      "DOWN",
    ]);
  });

  test("filters by market", async () => {
    await createStock({ symbol: "AAPL", close: "110", previousClose: "100" });
    await createStock({
      symbol: "NOKIA",
      exchange: "XHEL",
      close: "5.5",
      previousClose: "5",
    });

    const response = await request(app).get(
      "/api/stocks/overview?market=helsinki",
    );

    expect(response.status).toBe(200);
    expect(response.body.gainers.map((stock) => stock.symbol)).toEqual([
      "NOKIA",
    ]);
  });

  test("leaves out mock stocks", async () => {
    await createStock({
      symbol: "RISE",
      exchange: "MOCK",
      close: "110",
      previousClose: "100",
    });

    const response = await request(app).get("/api/stocks/overview");

    expect(response.body.gainers).toEqual([]);
  });

  test("lists only stocks with at least two followers", async () => {
    const popular = await createStock({ symbol: "POP" });
    const single = await createStock({ symbol: "ONE" });

    await follow(popular, 2);
    await follow(single, 1);

    const response = await request(app).get("/api/stocks/overview");

    expect(response.body.mostFollowed).toEqual([
      expect.objectContaining({ symbol: "POP", follower_count: 2 }),
    ]);
  });

  test("rejects an unsupported market", async () => {
    const response = await request(app).get(
      "/api/stocks/overview?market=invalid",
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("rejects a repeated market parameter", async () => {
    const response = await request(app).get(
      "/api/stocks/overview?market=us&market=helsinki",
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });
});
