const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

const originalApiKey = process.env.TWELVE_DATA_API_KEY;

// Shaped like Twelve Data's /symbol_search items.
const searchItem = (overrides = {}) => ({
  symbol: "AAPL",
  instrument_name: "Apple Inc",
  exchange: "NASDAQ",
  mic_code: "XNGS",
  exchange_timezone: "America/New_York",
  instrument_type: "Common Stock",
  country: "United States",
  currency: "USD",
  ...overrides,
});

const searchResponse = (items) => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({ data: items, status: "ok" }),
});

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

describe("GET /api/stocks/search", () => {
  let fetchMock;
  let admin;

  beforeEach(async () => {
    await clearDatabase();

    process.env.TWELVE_DATA_API_KEY = "test-api-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    admin = await loginAs("admin");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (originalApiKey === undefined) {
      delete process.env.TWELVE_DATA_API_KEY;
    } else {
      process.env.TWELVE_DATA_API_KEY = originalApiKey;
    }

    await pool.end();
  });

  test("rejects guests", async () => {
    const response = await request(app)
      .get("/api/stocks/search")
      .query({ q: "apple" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects users and moderators", async () => {
    for (const role of ["user", "moderator"]) {
      const agent = await loginAs(role);

      const response = await agent
        .get("/api/stocks/search")
        .query({ q: "apple" });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Insufficient permissions" });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects a missing or too long query", async () => {
    for (const query of [{}, { q: " " }, { q: "a".repeat(51) }]) {
      const response = await admin.get("/api/stocks/search").query(query);

      expect(response.status).toBe(400);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends the query to Twelve Data", async () => {
    fetchMock.mockResolvedValue(searchResponse([]));

    const response = await admin
      .get("/api/stocks/search")
      .query({ q: " nokia " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [] });

    const url = new URL(fetchMock.mock.calls[0][0]);

    expect(url.pathname).toBe("/symbol_search");
    expect(url.searchParams.get("symbol")).toBe("nokia");
  });

  test("returns stocks on supported exchanges with MIC codes", async () => {
    fetchMock.mockResolvedValue(
      searchResponse([
        searchItem(),
        searchItem({
          symbol: "NOKIA",
          instrument_name: "Nokia Oyj",
          exchange: "OMXH",
          mic_code: "XHEL",
          country: "Finland",
          currency: "EUR",
        }),
        searchItem({ exchange: "LSE", mic_code: "XLON", currency: "GBP" }),
        searchItem({ symbol: "QQQ", instrument_type: "ETF" }),
        // Listed twice under different Nasdaq market tiers.
        searchItem({ mic_code: "XNMS" }),
      ]),
    );

    const response = await admin
      .get("/api/stocks/search")
      .query({ q: "a" });

    expect(response.status).toBe(200);

    expect(response.body.results).toEqual([
      {
        symbol: "AAPL",
        exchange: "XNAS",
        name: "Apple Inc",
        currency: "USD",
        country: "United States",
        stockId: null,
      },
      {
        symbol: "NOKIA",
        exchange: "XHEL",
        name: "Nokia Oyj",
        currency: "EUR",
        country: "Finland",
        stockId: null,
      },
    ]);
  });

  test("returns the ID of stocks already in the database", async () => {
    const existing = await stockModel.createStock({
      symbol: "AAPL",
      exchange: "XNAS",
      name: "Apple Inc.",
      currency: "USD",
    });

    // Same symbol on another exchange must not count as added.
    fetchMock.mockResolvedValue(
      searchResponse([searchItem(), searchItem({ exchange: "NYSE" })]),
    );

    const response = await admin
      .get("/api/stocks/search")
      .query({ q: "apple" });

    expect(response.status).toBe(200);

    expect(
      response.body.results.map((result) => [result.exchange, result.stockId]),
    ).toEqual([
      ["XNAS", existing.id],
      ["XNYS", null],
    ]);
  });

  test("returns 503 when Twelve Data is not configured", async () => {
    delete process.env.TWELVE_DATA_API_KEY;

    const response = await admin
      .get("/api/stocks/search")
      .query({ q: "apple" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Stock search is not configured." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns 502 when Twelve Data returns an error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        status: "error",
        message: "You have run out of API credits",
      }),
    });

    const response = await admin
      .get("/api/stocks/search")
      .query({ q: "apple" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: "Stock search service returned an error.",
    });
  });

  test("returns 504 when Twelve Data times out", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError"),
    );

    const response = await admin
      .get("/api/stocks/search")
      .query({ q: "apple" });

    expect(response.status).toBe(504);
    expect(response.body).toEqual({
      error: "Stock search timed out. Please try again.",
    });
  });
});
