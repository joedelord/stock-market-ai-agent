const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const { MAX_ALERTS_PER_USER } = require("../models/alertModel");
const stockModel = require("../models/stockModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

let alice;
let bob;
let stock;

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

const createRule = (overrides = {}) => ({
  stockId: stock.id,
  alertType: "daily_change_above",
  threshold: 3,
  repeatMode: "daily",
  ...overrides,
});

const createAlert = (agent, body = createRule()) =>
  agent.post("/api/alerts").send(body);

beforeEach(async () => {
  await clearDatabase();

  alice = await createUserAgent("alice");
  bob = await createUserAgent("bob");

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

describe("Alerts API", () => {
  test("requires authentication for every operation", async () => {
    const guest = request(app);

    expect((await guest.get("/api/alerts")).status).toBe(401);
    expect((await createAlert(guest)).status).toBe(401);

    expect(
      (await guest.patch("/api/alerts/1").send({ isActive: false })).status,
    ).toBe(401);

    expect((await guest.delete("/api/alerts/1")).status).toBe(401);
  });

  test.each([
    ["price_above", 100],
    ["price_below", 80],
    ["daily_change_above", 3],
    ["daily_change_below", -4],
  ])("creates a %s alert", async (alertType, threshold) => {
    const response = await createAlert(
      alice,
      createRule({ alertType, threshold }),
    );

    expect(response.status).toBe(201);

    expect(response.body.alert).toMatchObject({
      stock_id: stock.id,
      alert_type: alertType,
      threshold: threshold.toFixed(6),
      repeat_mode: "daily",
      is_active: true,
    });
  });

  test("lists alerts with stock details and without internal columns", async () => {
    await createAlert(alice);

    const response = await alice.get("/api/alerts");

    expect(response.status).toBe(200);
    expect(response.body.alerts).toHaveLength(1);

    expect(response.body.alerts[0]).toMatchObject({
      symbol: "AAPL",
      name: "Apple",
      exchange: "XNAS",
      currency: "USD",
    });

    expect(response.body.alerts[0]).not.toHaveProperty("user_id");
    expect(response.body.alerts[0]).not.toHaveProperty(
      "last_triggered_market_date",
    );
  });

  test("defaults repeat mode to once", async () => {
    const { repeatMode: _omitted, ...rule } = createRule();

    const response = await createAlert(alice, rule);

    expect(response.status).toBe(201);
    expect(response.body.alert.repeat_mode).toBe("once");
  });

  test("hides other users' alerts", async () => {
    const { body } = await createAlert(alice);
    const url = `/api/alerts/${body.alert.id}`;

    expect((await bob.get("/api/alerts")).body.alerts).toEqual([]);

    const updateResponse = await bob.patch(url).send({ isActive: false });

    expect(updateResponse.status).toBe(404);
    expect(updateResponse.body).toEqual({ error: "Alert not found" });

    const deleteResponse = await bob.delete(url);

    expect(deleteResponse.status).toBe(404);
    expect(deleteResponse.body).toEqual({ error: "Alert not found" });

    expect((await alice.get("/api/alerts")).body.alerts[0].is_active).toBe(
      true,
    );
  });

  test("pauses and resumes an alert", async () => {
    const { body } = await createAlert(alice);
    const url = `/api/alerts/${body.alert.id}`;

    const paused = await alice.patch(url).send({ isActive: false });

    expect(paused.status).toBe(200);
    expect(paused.body.alert.is_active).toBe(false);

    const resumed = await alice.patch(url).send({ isActive: true });

    expect(resumed.body.alert.is_active).toBe(true);
  });

  test("replaces a complete rule", async () => {
    const { body } = await createAlert(alice);

    const response = await alice.patch(`/api/alerts/${body.alert.id}`).send({
      alertType: "price_above",
      threshold: 100,
      repeatMode: "once",
    });

    expect(response.status).toBe(200);

    expect(response.body.alert).toMatchObject({
      alert_type: "price_above",
      threshold: "100.000000",
      repeat_mode: "once",
      is_active: true,
    });
  });

  test("deletes an alert once", async () => {
    const { body } = await createAlert(alice);
    const url = `/api/alerts/${body.alert.id}`;

    expect((await alice.delete(url)).status).toBe(204);
    expect((await alice.get("/api/alerts")).body.alerts).toEqual([]);

    const response = await alice.delete(url);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Alert not found" });
  });

  test.each([
    ["a zero threshold", { threshold: 0 }],
    ["a negative price threshold", { threshold: -3 }],
    ["a string threshold", { threshold: "3" }],
    ["more than six decimals", { threshold: 0.0000001 }],
    ["a too large threshold", { threshold: 1e12 }],
    ["a too large stock ID", { stockId: "9223372036854775808" }],
    ["an unknown alert type", { alertType: "unknown" }],
    ["an unknown repeat mode", { repeatMode: "hourly" }],
    ["a user ID", { userId: 2 }],
    [
      "a positive daily_change_below",
      { alertType: "daily_change_below", threshold: 4 },
    ],
    [
      "a daily_change_below under -100",
      { alertType: "daily_change_below", threshold: -101 },
    ],
  ])("rejects creating an alert with %s", async (_case, overrides) => {
    const response = await createAlert(alice, createRule(overrides));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test.each([
    ["an empty body", {}],
    ["a threshold alone", { threshold: 5 }],
    [
      "a positive daily_change_below",
      { alertType: "daily_change_below", threshold: 4, repeatMode: "daily" },
    ],
    ["a user ID", { isActive: false, userId: 2 }],
  ])("rejects updating an alert with %s", async (_case, patch) => {
    const { body } = await createAlert(alice);

    const response = await alice
      .patch(`/api/alerts/${body.alert.id}`)
      .send(patch);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("rejects an invalid alert ID", async () => {
    const response = await alice.delete("/api/alerts/abc");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("returns 404 for an unknown stock", async () => {
    const response = await createAlert(alice, createRule({ stockId: 999999 }));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Active stock not found" });
  });

  test("returns 404 for an inactive stock", async () => {
    await pool.query("UPDATE stocks SET is_active = FALSE WHERE id = $1", [
      stock.id,
    ]);

    const response = await createAlert(alice);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Active stock not found" });
  });

  test("the database rejects invalid thresholds", async () => {
    const { body } = await createAlert(alice);

    await expect(
      pool.query("UPDATE stock_alerts SET threshold = -1 WHERE id = $1", [
        body.alert.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  test("limits the number of alerts per user", async () => {
    const userId = (
      await pool.query("SELECT id FROM users WHERE username = 'alice'")
    ).rows[0].id;

    await pool.query(
      `INSERT INTO stock_alerts (user_id, stock_id, alert_type, threshold)
      SELECT $1, $2, 'price_above', n
      FROM generate_series(1, $3) AS n`,
      [userId, stock.id, MAX_ALERTS_PER_USER],
    );

    const response = await createAlert(alice);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: `You can have at most ${MAX_ALERTS_PER_USER} alerts`,
    });

    // The limit is per user.
    expect((await createAlert(bob)).status).toBe(201);
  });

  test("updates updated_at on rule changes only", async () => {
    const { body } = await createAlert(alice);

    const oldTime = new Date("2026-01-01T00:00:00.000Z").toISOString();

    // The trigger watches only the rule columns, so backdating updated_at
    // and recording a trigger time both leave it alone.
    await pool.query("UPDATE stock_alerts SET updated_at = $2 WHERE id = $1", [
      body.alert.id,
      oldTime,
    ]);

    await pool.query(
      "UPDATE stock_alerts SET last_triggered_at = NOW() WHERE id = $1",
      [body.alert.id],
    );

    const getUpdatedAt = async () =>
      (await alice.get("/api/alerts")).body.alerts[0].updated_at;

    expect(await getUpdatedAt()).toBe(oldTime);

    await alice.patch(`/api/alerts/${body.alert.id}`).send({ isActive: false });

    expect(await getUpdatedAt()).not.toBe(oldTime);
  });

  test("deleting a user deletes their alerts", async () => {
    await createAlert(alice);

    await pool.query("DELETE FROM users WHERE username = 'alice'");

    const result = await pool.query("SELECT id FROM stock_alerts");

    expect(result.rows).toEqual([]);
  });
});
