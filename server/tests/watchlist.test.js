const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

let alice;
let bob;
let apple;
let microsoft;

const createUserAgent = async (username) => {
  await createUserAccount({
    username,
    email: `${username}@example.com`,
    password: "password123",
    role: "user",
  });

  const agent = request.agent(app);

  const response = await agent.post("/api/auth/login").send({
    email: `${username}@example.com`,
    password: "password123",
  });

  expect(response.status).toBe(200);

  return agent;
};

beforeEach(async () => {
  await clearDatabase();

  alice = await createUserAgent("alice");
  bob = await createUserAgent("bob");

  apple = await stockModel.createStock({
    symbol: "AAPL",
    exchange: "XNAS",
    name: "Apple",
    currency: "USD",
  });

  microsoft = await stockModel.createStock({
    symbol: "MSFT",
    exchange: "XNAS",
    name: "Microsoft",
    currency: "USD",
  });
});

afterAll(async () => {
  await pool.end();
});

const follow = (agent, stock) =>
  agent.post("/api/me/stocks").send({ stockId: stock.id });

const unfollow = (agent, stock) => agent.delete(`/api/me/stocks/${stock.id}`);

const getStockIds = async (agent) => {
  const response = await agent.get("/api/me/stocks");

  return response.body.stocks.map((stock) => stock.id);
};

describe("Watchlist API", () => {
  test("requires login on every operation", async () => {
    const guest = request(app);

    expect((await guest.get("/api/me/stocks")).status).toBe(401);
    expect((await follow(guest, apple)).status).toBe(401);
    expect((await unfollow(guest, apple)).status).toBe(401);
  });

  test("starts empty even when the shared catalog contains stocks", async () => {
    expect(await getStockIds(alice)).toEqual([]);
    expect(await stockModel.getFollowedStocks()).toEqual([]);
  });

  test("follows a stock and returns it", async () => {
    const response = await follow(alice, apple);

    expect(response.status).toBe(201);
    expect(response.body.stock).toMatchObject({ id: apple.id, symbol: "AAPL" });
    expect(await getStockIds(alice)).toEqual([apple.id]);
  });

  test("keeps each user's watchlist separate", async () => {
    await follow(alice, apple);
    await follow(bob, microsoft);

    expect(await getStockIds(alice)).toEqual([apple.id]);
    expect(await getStockIds(bob)).toEqual([microsoft.id]);
  });

  test("unfollowing only affects the current user's list", async () => {
    await follow(alice, apple);

    // Delete is idempotent, so Bob gets 204 for a stock not on Bob's list.
    expect((await unfollow(bob, apple)).status).toBe(204);
    expect(await getStockIds(alice)).toEqual([apple.id]);

    expect((await unfollow(alice, apple)).status).toBe(204);
    expect(await getStockIds(alice)).toEqual([]);
  });

  test("unfollowing keeps the shared stock and its prices", async () => {
    await follow(alice, apple);

    await stockModel.saveStockPrices(apple.id, "15min", [
      {
        priceTime: "2026-10-22 12:00:00",
        close: "100",
        open: "100",
        high: "100",
        low: "100",
        volume: "1",
      },
    ]);

    await unfollow(alice, apple);

    expect(await stockModel.getStockPrices(apple.id)).toHaveLength(1);
    expect(await stockModel.getStockById(apple.id)).toBeDefined();
  });

  test("deduplicates repeated and concurrent follows", async () => {
    const responses = await Promise.all([
      follow(alice, apple),
      follow(alice, apple),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 201,
    ]);
    expect((await follow(alice, apple)).status).toBe(200);
    expect(await getStockIds(alice)).toEqual([apple.id]);
  });

  test("the scheduler selects a stock while anyone follows it", async () => {
    await follow(alice, apple);
    await follow(bob, apple);

    const getFollowedIds = async () =>
      (await stockModel.getFollowedStocks()).map((stock) => stock.id);

    expect(await getFollowedIds()).toEqual([apple.id]);

    await unfollow(alice, apple);
    expect(await getFollowedIds()).toEqual([apple.id]);

    await unfollow(bob, apple);
    expect(await getFollowedIds()).toEqual([]);
  });

  test("rejects invalid stock IDs and extra fields", async () => {
    for (const body of [
      { stockId: 0 },
      { stockId: "abc" },
      { stockId: 1.5 },
      { stockId: apple.id, userId: 2 },
      {},
    ]) {
      expect((await alice.post("/api/me/stocks").send(body)).status).toBe(400);
    }

    expect((await alice.delete("/api/me/stocks/abc")).status).toBe(400);
    expect(await getStockIds(alice)).toEqual([]);
  });

  test("returns 404 for an unknown stock", async () => {
    const response = await follow(alice, { id: 99999 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Active stock not found" });
  });

  test("returns 404 for an inactive stock and hides it from the scheduler", async () => {
    await follow(alice, apple);

    await pool.query("UPDATE stocks SET is_active = FALSE WHERE id = $1", [
      apple.id,
    ]);

    const response = await follow(bob, apple);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Active stock not found" });
    expect(await stockModel.getFollowedStocks()).toEqual([]);
  });

  test("removes a deleted user's follows but keeps the stock", async () => {
    await follow(alice, apple);

    await pool.query("DELETE FROM users WHERE username = 'alice'");

    const result = await pool.query("SELECT user_id FROM user_stocks");

    expect(result.rows).toEqual([]);
    expect(await stockModel.getStockById(apple.id)).toBeDefined();
  });
});
