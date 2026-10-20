const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");

const { createStock, saveStockPrices } = require("../models/stockModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

const START_TIME = Date.parse("2026-10-19T13:30:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// saveStockPrices expects UTC times without an offset, as Twelve Data sends them.
const makePrices = (count, stepMs, firstClose, startTime = START_TIME) =>
  Array.from({ length: count }, (_, index) => {
    const close = String(firstClose + index);

    return {
      priceTime: new Date(startTime + index * stepMs)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19),
      open: close,
      high: close,
      low: close,
      close,
      volume: "1000",
    };
  });

const saveQuarterHourPrices = (stockId, count) =>
  saveStockPrices(stockId, "15min", makePrices(count, FIFTEEN_MINUTES_MS, 100));

const groqResponse = () => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    model: "test-model",
    choices: [
      {
        finish_reason: "stop",
        message: { content: "Price rose over the supplied period." },
      },
    ],
  }),
});

const loginAsUser = async () => {
  await createUserAccount({
    username: "testuser",
    email: "test@example.com",
    password: "password123",
    role: "user",
  });

  const agent = request.agent(app);

  await agent.post("/api/auth/login").send({
    email: "test@example.com",
    password: "password123",
  });

  return agent;
};

describe("Stock analysis", () => {
  let fetchMock;
  let stock;

  beforeEach(async () => {
    await clearDatabase();

    vi.stubEnv("GROQ_API_KEY", "test-api-key");
    vi.stubEnv("GROQ_MODEL", "test-model");

    fetchMock = vi.fn().mockResolvedValue(groqResponse());
    vi.stubGlobal("fetch", fetchMock);

    stock = await createStock({
      symbol: "AAPL",
      exchange: "XNAS",
      name: "Apple Inc.",
      currency: "USD",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await pool.end();
  });

  test("requires authentication", async () => {
    const response = await request(app).post(
      `/api/stocks/${stock.id}/analysis`,
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns metrics and an AI analysis", async () => {
    await saveQuarterHourPrices(stock.id, 3);

    const agent = await loginAsUser();

    const response = await agent.post(`/api/stocks/${stock.id}/analysis`);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");

    expect(response.body.stock).toMatchObject({
      id: stock.id,
      symbol: "AAPL",
    });

    expect(response.body.metrics).toMatchObject({
      interval: "15min",
      pointCount: 3,
      firstClose: 100,
      latestClose: 102,
      periodStart: "2026-10-19T13:30:00.000Z",
      periodEnd: "2026-10-19T14:00:00.000Z",
    });

    expect(response.body.analysis).toMatchObject({
      text: "Price rose over the supplied period.",
      model: "test-model",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("uses only 15min prices, even when other intervals are newer", async () => {
    await saveQuarterHourPrices(stock.id, 100);

    // Newer daily rows would push 15min rows out of an unfiltered LIMIT.
    await saveStockPrices(
      stock.id,
      "1day",
      makePrices(10, ONE_DAY_MS, 500, START_TIME + 30 * ONE_DAY_MS),
    );

    const agent = await loginAsUser();

    const response = await agent.post(`/api/stocks/${stock.id}/analysis`);

    expect(response.status).toBe(200);

    expect(response.body.metrics).toMatchObject({
      pointCount: 100,
      maxClose: 199,
    });

    expect(response.body.metrics.sma50).not.toBeNull();
  });

  test("returns 404 for an unknown stock", async () => {
    const agent = await loginAsUser();

    const response = await agent.post("/api/stocks/999/analysis");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Stock not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects inactive stocks", async () => {
    await saveQuarterHourPrices(stock.id, 3);
    await pool.query("UPDATE stocks SET is_active = false WHERE id = $1", [
      stock.id,
    ]);

    const agent = await loginAsUser();

    const response = await agent.post(`/api/stocks/${stock.id}/analysis`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Stock is inactive" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects an invalid stock ID", async () => {
    const agent = await loginAsUser();

    const response = await agent.post("/api/stocks/abc/analysis");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns 422 when there is too little price history", async () => {
    await saveQuarterHourPrices(stock.id, 1);

    const agent = await loginAsUser();

    const response = await agent.post(`/api/stocks/${stock.id}/analysis`);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: "At least two price points from the same interval are required.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns a safe error when the AI provider fails", async () => {
    await saveQuarterHourPrices(stock.id, 3);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    });

    const agent = await loginAsUser();

    const response = await agent.post(`/api/stocks/${stock.id}/analysis`);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: "AI analysis service returned an error.",
    });
  });
});
