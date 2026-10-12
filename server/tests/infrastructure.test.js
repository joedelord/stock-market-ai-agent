const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const PostgresRateLimitStore = require("../middleware/postgresRateLimitStore");

const { clearDatabase } = require("./helpers/database");

const WINDOW_MS = 60 * 1000;

const createStore = (prefix) => {
  const store = new PostgresRateLimitStore(prefix);

  store.init({ windowMs: WINDOW_MS });

  return store;
};

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await pool.end();
});

describe("Health check", () => {
  test("reports ok when the database is reachable", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      status: "ok",
    });
  });
});

describe("Request IDs", () => {
  test("generates a request ID", async () => {
    const response = await request(app).get("/api/health");

    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("reuses a safe incoming request ID", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "from-proxy-123");

    expect(response.headers["x-request-id"]).toBe("from-proxy-123");
  });

  test("replaces an unsafe incoming request ID", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "bad id with spaces");

    expect(response.headers["x-request-id"]).not.toBe("bad id with spaces");
  });
});

describe("PostgreSQL rate limit store", () => {
  test("shares counts between instances", async () => {
    // Two stores stand in for two server processes.
    const first = createStore("login");
    const second = createStore("login");

    await first.increment("1.2.3.4");
    const result = await second.increment("1.2.3.4");

    expect(result.totalHits).toBe(2);
    expect(result.resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  test("keeps limiters with different names apart", async () => {
    await createStore("login").increment("1.2.3.4");

    const result = await createStore("register").increment("1.2.3.4");

    expect(result.totalHits).toBe(1);
  });

  test("starts a new window after the old one expires", async () => {
    const store = createStore("login");

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");

    await pool.query(
      "UPDATE rate_limits SET reset_at = NOW() - INTERVAL '1 second'",
    );

    const result = await store.increment("1.2.3.4");

    expect(result.totalHits).toBe(1);
  });

  test("decrements and resets keys", async () => {
    const store = createStore("login");

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");
    await store.decrement("1.2.3.4");

    expect((await store.increment("1.2.3.4")).totalHits).toBe(2);

    await store.resetKey("1.2.3.4");

    expect((await store.increment("1.2.3.4")).totalHits).toBe(1);
  });
});
