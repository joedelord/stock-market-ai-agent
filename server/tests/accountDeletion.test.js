const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

const PASSWORD = "password123";

let stock;

const createUserAgent = async (username, role = "user") => {
  await createUserAccount({
    username,
    email: `${username}@example.com`,
    password: PASSWORD,
    role,
  });

  const agent = request.agent(app);

  const response = await agent.post("/api/auth/login").send({
    email: `${username}@example.com`,
    password: PASSWORD,
  });

  expect(response.status).toBe(200);

  return agent;
};

const countRows = async (table, username) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM ${table}
     WHERE user_id = (SELECT id FROM users WHERE username = $1)`,
    [username],
  );

  return result.rows[0].count;
};

const userExists = async (username) => {
  const result = await pool.query(
    "SELECT 1 FROM users WHERE username = $1",
    [username],
  );

  return result.rowCount === 1;
};

beforeEach(async () => {
  await clearDatabase();

  stock = await stockModel.createStock({
    symbol: "AAPL",
    exchange: "XNAS",
    name: "Apple",
    currency: "USD",
  });
});

afterAll(async () => {
  await pool.end();
});

describe("Account deletion", () => {
  test("deletes the account with its watchlist and alerts", async () => {
    const alice = await createUserAgent("alice");

    await alice.post("/api/me/stocks").send({ stockId: stock.id });
    await alice.post("/api/alerts").send({
      stockId: stock.id,
      alertType: "daily_change_above",
      threshold: 3,
      repeatMode: "daily",
    });

    expect(await countRows("user_stocks", "alice")).toBe(1);
    expect(await countRows("stock_alerts", "alice")).toBe(1);

    const response = await alice
      .delete("/api/auth/me")
      .send({ password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Account deleted" });
    expect(response.headers["set-cookie"][0]).toMatch(/^auth_token=;/);

    expect(await userExists("alice")).toBe(false);

    const leftovers = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM user_stocks)::int AS watchlist,
         (SELECT COUNT(*) FROM stock_alerts)::int AS alerts`,
    );

    expect(leftovers.rows[0]).toEqual({ watchlist: 0, alerts: 0 });
  });

  test("ends sessions on other devices", async () => {
    const alice = await createUserAgent("alice");

    const otherDevice = request.agent(app);
    await otherDevice.post("/api/auth/login").send({
      email: "alice@example.com",
      password: PASSWORD,
    });

    await alice.delete("/api/auth/me").send({ password: PASSWORD });

    const response = await otherDevice.get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Invalid or expired authentication token",
    });
  });

  test("leaves other users untouched", async () => {
    const alice = await createUserAgent("alice");
    const bob = await createUserAgent("bob");

    await bob.post("/api/me/stocks").send({ stockId: stock.id });

    await alice.delete("/api/auth/me").send({ password: PASSWORD });

    expect(await userExists("bob")).toBe(true);
    expect(await countRows("user_stocks", "bob")).toBe(1);
    expect((await bob.get("/api/auth/me")).status).toBe(200);
  });

  test("rejects an incorrect password", async () => {
    const alice = await createUserAgent("alice");

    const response = await alice
      .delete("/api/auth/me")
      .send({ password: "wrongpassword" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Password is incorrect" });
    expect(await userExists("alice")).toBe(true);
  });

  test("requires the password", async () => {
    const alice = await createUserAgent("alice");

    const response = await alice.delete("/api/auth/me").send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
    expect(await userExists("alice")).toBe(true);
  });

  test("requires authentication", async () => {
    const response = await request(app)
      .delete("/api/auth/me")
      .send({ password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
  });

  test("does not delete the last admin", async () => {
    const admin = await createUserAgent("adminuser", "admin");

    const response = await admin
      .delete("/api/auth/me")
      .send({ password: PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Cannot remove the last admin" });
    expect(await userExists("adminuser")).toBe(true);
  });
});
