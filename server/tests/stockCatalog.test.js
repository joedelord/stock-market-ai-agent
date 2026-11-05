const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const {
  DEFAULT_MAX_ACTIVE_STOCKS,
  getMaxActiveStocks,
} = require("../config/stockLimit");
const stockModel = require("../models/stockModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

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

const stockData = (symbol) => ({
  symbol,
  exchange: "XNAS",
  name: `${symbol} Inc.`,
  currency: "USD",
});

let admin;

beforeEach(async () => {
  await clearDatabase();
  admin = await loginAs("admin");
});

afterEach(() => {
  delete process.env.MAX_ACTIVE_STOCKS;
});

afterAll(async () => {
  await pool.end();
});

describe("MAX_ACTIVE_STOCKS", () => {
  test("defaults to 20", () => {
    expect(getMaxActiveStocks()).toBe(DEFAULT_MAX_ACTIVE_STOCKS);
    expect(DEFAULT_MAX_ACTIVE_STOCKS).toBe(20);
  });

  test.each(["0", "-1", "2.5", "many"])("rejects %s", (value) => {
    process.env.MAX_ACTIVE_STOCKS = value;

    expect(() => getMaxActiveStocks()).toThrow(
      "MAX_ACTIVE_STOCKS must be a positive whole number",
    );
  });
});

describe("Active stock limit", () => {
  test("rejects a new stock when the limit is reached", async () => {
    process.env.MAX_ACTIVE_STOCKS = "2";

    expect((await admin.post("/api/stocks").send(stockData("AAA"))).status).toBe(201);
    expect((await admin.post("/api/stocks").send(stockData("BBB"))).status).toBe(201);

    const response = await admin.post("/api/stocks").send(stockData("CCC"));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error:
        "Stock limit reached (2 active stocks). Remove a stock before adding another.",
    });
  });

  test("allows adding again after a stock is removed", async () => {
    process.env.MAX_ACTIVE_STOCKS = "1";

    const created = await admin.post("/api/stocks").send(stockData("AAA"));
    await admin.delete(`/api/stocks/${created.body.stock.id}`);

    const response = await admin.post("/api/stocks").send(stockData("BBB"));

    expect(response.status).toBe(201);
  });

  test("does not count inactive stocks", async () => {
    process.env.MAX_ACTIVE_STOCKS = "1";

    const inactive = await stockModel.createStock(stockData("OLD"));
    await pool.query("UPDATE stocks SET is_active = FALSE WHERE id = $1", [
      inactive.id,
    ]);

    const response = await admin.post("/api/stocks").send(stockData("NEW"));

    expect(response.status).toBe(201);
  });

  test("stays within the limit when admins add stocks at the same time", async () => {
    process.env.MAX_ACTIVE_STOCKS = "1";

    const responses = await Promise.all(
      ["AAA", "BBB", "CCC"].map((symbol) =>
        admin.post("/api/stocks").send(stockData(symbol)),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 400, 400]);
  });
});

describe("GET /api/stocks/catalog", () => {
  test("lists stocks with follower and alert counts and the limit", async () => {
    const user = await loginAs("user");
    const apple = await stockModel.createStock(stockData("AAPL"));
    await stockModel.createStock(stockData("MSFT"));

    await user.post("/api/me/stocks").send({ stockId: apple.id });
    await user.post("/api/alerts").send({
      stockId: apple.id,
      alertType: "daily_change_above",
      threshold: 3,
      repeatMode: "daily",
    });

    const response = await admin.get("/api/stocks/catalog");

    expect(response.status).toBe(200);
    expect(response.body.limit).toEqual({ active: 2, max: 20 });
    expect(
      response.body.stocks.map(
        ({ symbol, follower_count, active_alert_count }) => ({
          symbol,
          follower_count,
          active_alert_count,
        }),
      ),
    ).toEqual([
      { symbol: "AAPL", follower_count: 1, active_alert_count: 1 },
      { symbol: "MSFT", follower_count: 0, active_alert_count: 0 },
    ]);
  });

  test("is only for admins", async () => {
    const guest = await request(app).get("/api/stocks/catalog");
    expect(guest.status).toBe(401);
    expect(guest.body).toEqual({ error: "Authentication required" });

    for (const role of ["user", "moderator"]) {
      const agent = await loginAs(role);
      const response = await agent.get("/api/stocks/catalog");

      expect(response.status).toBe(403);
    }
  });
});

describe("DELETE /api/stocks/:id", () => {
  test("removes the stock with its watchlist entries and alerts", async () => {
    const user = await loginAs("user");
    const apple = await stockModel.createStock(stockData("AAPL"));
    const microsoft = await stockModel.createStock(stockData("MSFT"));

    await user.post("/api/me/stocks").send({ stockId: apple.id });
    await user.post("/api/me/stocks").send({ stockId: microsoft.id });
    await user.post("/api/alerts").send({
      stockId: apple.id,
      alertType: "daily_change_above",
      threshold: 3,
      repeatMode: "daily",
    });

    const response = await admin.delete(`/api/stocks/${apple.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Stock deleted",
      stock: {
        id: apple.id,
        symbol: "AAPL",
        exchange: "XNAS",
        name: "AAPL Inc.",
      },
    });

    expect(await stockModel.getStockById(apple.id)).toBeUndefined();

    const watchlist = await user.get("/api/me/stocks");
    expect(watchlist.body.stocks.map((stock) => stock.symbol)).toEqual([
      "MSFT",
    ]);

    const alerts = await pool.query("SELECT COUNT(*)::int AS count FROM stock_alerts");
    expect(alerts.rows[0].count).toBe(0);
  });

  test("returns 404 for a missing stock", async () => {
    const response = await admin.delete("/api/stocks/999999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Stock not found" });
  });

  test("is only for admins", async () => {
    const stock = await stockModel.createStock(stockData("AAPL"));

    const guest = await request(app).delete(`/api/stocks/${stock.id}`);
    expect(guest.status).toBe(401);

    for (const role of ["user", "moderator"]) {
      const agent = await loginAs(role);
      const response = await agent.delete(`/api/stocks/${stock.id}`);

      expect(response.status).toBe(403);
    }

    expect(await stockModel.getStockById(stock.id)).toBeDefined();
  });
});
