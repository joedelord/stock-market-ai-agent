const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const userModel = require("../models/userModel");
const watchlistModel = require("../models/watchlistModel");
const alertModel = require("../models/alertModel");
const emailService = require("../services/emailService");
const marketDataService = require("../services/marketDataService");
const stockAnalysisService = require("../services/stockAnalysisService");
const {
  MAX_DIGEST_ATTEMPTS,
  buildUserDigest,
  getDigestDate,
  sendDailyDigests,
} = require("../services/dailyDigestService");
const { createUserAccount } = require("../services/userService");
const { readUnsubscribeToken } = require("../utils/unsubscribeToken");
const { clearDatabase } = require("./helpers/database");

// 17:00 in New York on Thursday 2026-10-22, the first digest run of the day.
const RUN_TIME = new Date("2026-10-22T21:00:00.000Z");
const DIGEST_DATE = "2026-10-22";
const QUOTE_TIME = "2026-10-22T20:00:00.000Z";

const NO_DELAYS = { quoteDelayMs: 0, groqDelayMs: 0 };

const groqResponse = () => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    model: "test-model",
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            priceMovement: "Apple rose 5% from the previous session close.",
            movingAverages: "Too few points for moving averages.",
            newsContext: "Company news is not configured.",
            limitations: "The data may be incomplete.",
            citedArticles: [],
          }),
        },
      },
    ],
  }),
});

let users;
let apple;
let microsoft;
let sendDigest;
let fetchMock;

const createUser = async (name, { verified = true, digest = true } = {}) => {
  const user = await createUserAccount({
    username: name,
    email: `${name}@example.com`,
    password: "password123",
    role: "user",
    emailVerified: verified,
  });

  await userModel.updateEmailPreferences(user.id, {
    emailDigestEnabled: digest,
  });

  return user;
};

const createStock = (symbol, name) =>
  stockModel.createStock({ symbol, exchange: "XNAS", name, currency: "USD" });

// A few bars, so the metrics have a period to describe.
const saveBars = (stock, close) =>
  stockModel.saveStockPrices(
    stock.id,
    "15min",
    ["2026-10-22 19:30:00", "2026-10-22 19:45:00", "2026-10-22 20:00:00"].map(
      (priceTime) => ({
        priceTime,
        open: String(close),
        high: String(close),
        low: String(close),
        close: String(close),
        volume: "1000",
      }),
    ),
  );

const saveQuote = (stock, close, previousClose) =>
  stockModel.saveStockQuote(stock.id, {
    priceTime: QUOTE_TIME,
    close,
    previousClose,
  });

const getDigestRows = async () => {
  const result = await pool.query(
    `SELECT
      user_id,
      digest_date::text AS digest_date,
      status,
      attempts
    FROM daily_digests
    ORDER BY user_id, digest_date`,
  );

  return result.rows;
};

const groqCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes("groq.com"));

beforeEach(async () => {
  await clearDatabase();

  vi.stubEnv("GROQ_API_KEY", "test-api-key");
  vi.stubEnv("GROQ_MODEL", "test-model");
  vi.stubEnv("MARKETAUX_API_KEY", "");

  fetchMock = vi.fn().mockImplementation(async () => groqResponse());
  vi.stubGlobal("fetch", fetchMock);

  sendDigest = vi
    .spyOn(emailService, "sendDailyDigestEmail")
    .mockResolvedValue();

  apple = await createStock("AAPL", "Apple Inc.");
  microsoft = await createStock("MSFT", "Microsoft Corporation");

  // Apple +5 % is past the fixed 3 % threshold; Microsoft +1 % is not.
  await saveBars(apple, 105);
  await saveQuote(apple, 105, 100);
  await saveBars(microsoft, 101);
  await saveQuote(microsoft, 101, 100);

  users = {
    anna: await createUser("anna"),
    ben: await createUser("ben"),
  };

  await watchlistModel.addWatchlistStock(users.anna.id, apple.id);
  await watchlistModel.addWatchlistStock(users.anna.id, microsoft.id);
  await watchlistModel.addWatchlistStock(users.ben.id, apple.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe("getDigestDate", () => {
  test("uses the New York date, also when UTC is already the next day", () => {
    expect(getDigestDate(new Date("2026-10-23T00:30:00.000Z"))).toBe(
      "2026-10-22",
    );
  });
});

describe("sendDailyDigests", () => {
  test("sends each subscriber a summary with an AI explanation of the unusual move", async () => {
    const result = await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(result).toMatchObject({
      digestDate: DIGEST_DATE,
      queued: 2,
      explained: 1,
      sent: 2,
      failed: 0,
    });

    const [email, digest, token] = sendDigest.mock.calls.find(
      ([to]) => to === "anna@example.com",
    );

    expect(email).toBe("anna@example.com");
    expect(digest.rows.map((row) => row.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(digest.movers).toHaveLength(1);
    expect(digest.movers[0]).toMatchObject({
      symbol: "AAPL",
      close: 105,
      isSignificant: true,
      explanation: {
        priceMovement: "Apple rose 5% from the previous session close.",
        newsContext: "Company news is not configured.",
        articles: [],
      },
    });
    expect(digest.rows[1]).toMatchObject({
      symbol: "MSFT",
      isSignificant: false,
      explanation: null,
    });

    // The link turns off the digest only, never alert emails.
    expect(readUnsubscribeToken(token, "digest")).toBe(users.anna.id);
    expect(readUnsubscribeToken(token, "alerts")).toBeNull();

    expect(await getDigestRows()).toEqual([
      { user_id: users.anna.id, digest_date: DIGEST_DATE, status: "sent", attempts: 1 },
      { user_id: users.ben.id, digest_date: DIGEST_DATE, status: "sent", attempts: 1 },
    ]);
  });

  test("asks Groq once per stock however many users follow it", async () => {
    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(groqCalls()).toHaveLength(1);
  });

  test("sends nothing more when run again on the same day", async () => {
    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });
    sendDigest.mockClear();
    fetchMock.mockClear();

    const result = await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(result).toMatchObject({ queued: 0, sent: 0 });
    expect(sendDigest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("skips users who did not opt in, are unverified or follow no active stock", async () => {
    const optedOut = await createUser("optedout", { digest: false });
    const unverified = await createUser("unverified", { verified: false });
    const noStocks = await createUser("nostocks");
    const inactiveOnly = await createUser("inactive");
    const delisted = await createStock("OLD", "Old Corp");

    await pool.query("UPDATE stocks SET is_active = FALSE WHERE id = $1", [
      delisted.id,
    ]);
    await watchlistModel.addWatchlistStock(optedOut.id, apple.id);
    await watchlistModel.addWatchlistStock(unverified.id, apple.id);
    await watchlistModel.addWatchlistStock(inactiveOnly.id, delisted.id);

    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    const recipients = sendDigest.mock.calls.map(([to]) => to).sort();

    expect(recipients).toEqual(["anna@example.com", "ben@example.com"]);

    const queuedUsers = (await getDigestRows()).map((row) => row.user_id);

    expect(queuedUsers).not.toContain(noStocks.id);
  });

  test("cancels a digest the user turned off after it was queued", async () => {
    sendDigest.mockImplementationOnce(async () => {
      await userModel.updateEmailPreferences(users.ben.id, {
        emailDigestEnabled: false,
      });
    });

    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    // Anna's digest is claimed first and turns Ben's off before his is sent.
    expect(sendDigest).toHaveBeenCalledTimes(1);
    expect((await getDigestRows()).map((row) => row.status)).toEqual([
      "sent",
      "cancelled",
    ]);
  });

  test("retries a failed email on a later run and gives up after the last attempt", async () => {
    sendDigest.mockRejectedValue(new Error("SMTP down"));

    for (let attempt = 1; attempt <= MAX_DIGEST_ATTEMPTS; attempt += 1) {
      await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });
      // Stands in for the wait between scheduler runs.
      await pool.query(
        "UPDATE daily_digests SET last_attempt_at = NOW() - INTERVAL '1 hour'",
      );
    }

    expect((await getDigestRows()).map((row) => row.status)).toEqual([
      "failed",
      "failed",
    ]);
    expect(sendDigest).toHaveBeenCalledTimes(2 * MAX_DIGEST_ATTEMPTS);
  });

  test("waits for the retry delay before sending a failed digest again", async () => {
    sendDigest.mockRejectedValueOnce(new Error("SMTP down"));

    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });
    sendDigest.mockClear();

    const result = await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(result.sent).toBe(0);
    expect(sendDigest).not.toHaveBeenCalled();
  });

  test("stops sending at the provider's rate limit", async () => {
    sendDigest.mockRejectedValueOnce(
      Object.assign(new Error("Too many"), { status: 429 }),
    );

    const result = await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(result).toMatchObject({ sent: 0, failed: 1, rateLimited: true });
    expect((await getDigestRows()).map((row) => row.status)).toEqual([
      "pending",
      "pending",
    ]);
  });

  test("gives up on digests of an earlier day", async () => {
    sendDigest.mockRejectedValue(new Error("SMTP down"));
    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    sendDigest.mockResolvedValue();
    const nextDay = new Date("2026-10-23T21:00:00.000Z");
    const result = await sendDailyDigests({ date: nextDay, ...NO_DELAYS });

    expect(result.expired).toBe(2);
    expect(await getDigestRows()).toMatchObject([
      { digest_date: "2026-10-22", status: "failed" },
      { digest_date: "2026-10-23", status: "sent" },
      { digest_date: "2026-10-22", status: "failed" },
      { digest_date: "2026-10-23", status: "sent" },
    ]);
  });

  test("still sends the digest when Groq is busy", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ error: { message: "Rate limit" } }),
    });

    const result = await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(result).toMatchObject({ explained: 0, sent: 2 });
    expect(sendDigest.mock.calls[0][1].movers[0]).toMatchObject({
      symbol: "AAPL",
      explanation: null,
    });
  });

  test("leaves out a stale analysis, whose numbers differ from the table", async () => {
    vi.spyOn(stockAnalysisService, "getOrCreateStockAnalysis").mockResolvedValue({
      analysis: {
        sections: { priceMovement: "Old", newsContext: "Old" },
        citedArticles: [],
      },
      cached: true,
      stale: true,
      news: { status: "not_configured", articles: [] },
    });

    const result = await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(result.explained).toBe(0);
    expect(sendDigest.mock.calls[0][1].movers[0].explanation).toBeNull();
  });

  test("fetches a final quote when the stored one is from before the close", async () => {
    await pool.query(
      "UPDATE stock_quotes SET fetched_at = NOW() - INTERVAL '2 hours' WHERE stock_id = $1",
      [apple.id],
    );
    const fetchQuote = vi
      .spyOn(marketDataService, "fetchStockQuote")
      .mockResolvedValue({
        priceTime: "2026-10-22T20:00:00.000Z",
        close: 106,
        previousClose: 100,
      });

    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(fetchQuote.mock.calls[0][0]).toMatchObject({ symbol: "AAPL" });
    expect(sendDigest.mock.calls[0][1].movers[0].close).toBe(106);
  });

  test("lists price alerts close to their threshold", async () => {
    await alertModel.createAlert(users.anna.id, {
      stockId: microsoft.id,
      alertType: "price_above",
      threshold: 103,
      repeatMode: "once",
    });

    await sendDailyDigests({ date: RUN_TIME, ...NO_DELAYS });

    const [, digest] = sendDigest.mock.calls.find(
      ([to]) => to === "anna@example.com",
    );

    expect(digest.nearAlerts).toEqual([
      expect.objectContaining({
        symbol: "MSFT",
        alertType: "price_above",
        threshold: 103,
        close: 101,
      }),
    ]);
    expect(digest.nearAlerts[0].distancePercent).toBeCloseTo(1.98, 2);
  });
});

describe("buildUserDigest", () => {
  const stock = (id, symbol, isActive = true) => ({
    id,
    symbol,
    exchange: "XNAS",
    name: symbol,
    currency: "USD",
    is_active: isActive,
  });

  const movement = (close, changePercent, isSignificant = false) => ({
    dayMovement: { close, changePercent, isSignificant, priceTime: QUOTE_TIME },
    explanation: null,
  });

  const priceAlert = (stockId, alertType, threshold, isActive = true) => ({
    stock_id: stockId,
    alert_type: alertType,
    threshold: String(threshold),
    is_active: isActive,
    symbol: "S",
    exchange: "XNAS",
    currency: "USD",
  });

  test("orders by size of the move, puts stocks without data last and skips inactive ones", () => {
    const digest = buildUserDigest({
      digestDate: DIGEST_DATE,
      stocks: [stock(1, "A"), stock(2, "B"), stock(3, "C"), stock(4, "D", false)],
      summaries: new Map([
        [1, movement(10, 1)],
        [3, movement(10, -4, true)],
        [4, movement(10, 9, true)],
      ]),
      alerts: [],
    });

    expect(digest.rows.map((row) => row.symbol)).toEqual(["C", "A", "B"]);
    expect(digest.rows[2]).toMatchObject({ close: null, changePercent: null });
    expect(digest.movers.map((row) => row.symbol)).toEqual(["C"]);
  });

  test("lists only active price alerts that have not been reached and are within 3 %", () => {
    const digest = buildUserDigest({
      digestDate: DIGEST_DATE,
      stocks: [stock(1, "A")],
      summaries: new Map([[1, movement(100, 0)]]),
      alerts: [
        priceAlert(1, "price_above", 102),
        priceAlert(1, "price_below", 98),
        priceAlert(1, "price_above", 104),
        priceAlert(1, "price_above", 99),
        priceAlert(1, "price_above", 101, false),
        priceAlert(1, "daily_change_above", 1),
      ],
    });

    expect(digest.nearAlerts.map((alert) => [alert.alertType, alert.threshold])).toEqual([
      ["price_above", 102],
      ["price_below", 98],
    ]);
  });
});

describe("sendDailyDigestEmail", () => {
  // The other tests stub the email; these check what it contains.
  beforeEach(() => {
    sendDigest.mockRestore();
  });

  const digest = {
    digestDate: DIGEST_DATE,
    rows: [
      {
        symbol: "AAPL",
        exchange: "XNAS",
        name: "Apple <Inc.>",
        currency: "USD",
        close: 105,
        changePercent: 5,
        isSignificant: true,
        explanation: {
          priceMovement: "Apple rose 5% [1].",
          newsContext: "A product launch may be related [1].",
          articles: [
            {
              number: 1,
              title: "Apple launches a phone",
              url: "https://news.example.com/a?x=1&y=2",
              source: "Example News",
            },
          ],
        },
      },
      {
        symbol: "MSFT",
        exchange: "XNAS",
        name: "Microsoft",
        currency: "USD",
        close: null,
        changePercent: null,
        isSignificant: false,
        explanation: null,
      },
    ],
    nearAlerts: [
      {
        symbol: "AAPL",
        exchange: "XNAS",
        currency: "USD",
        alertType: "price_above",
        threshold: 107,
        close: 105,
        distancePercent: 1.9,
      },
    ],
  };
  digest.movers = [digest.rows[0]];

  const send = async (content) => {
    const info = await emailService.sendDailyDigestEmail(
      "anna@example.com",
      content,
      "1.token",
    );

    return JSON.parse(info.message);
  };

  test("contains the moves, explanations, sources, alerts and a digest unsubscribe link", async () => {
    const message = await send(digest);

    expect(message.subject).toBe(
      "Stock Market AI: your watchlist on Thursday, October 22",
    );
    expect(message.text).toContain("AAPL (XNAS) +5.00 % · Apple <Inc.>");
    expect(message.text).toContain("Apple rose 5% [1].");
    expect(message.text).toContain(
      "[1] Apple launches a phone (Example News): https://news.example.com/a?x=1&y=2",
    );
    expect(message.text).toContain("AAPL (XNAS): 105.00 USD  +5.00 %");
    expect(message.text).toContain("MSFT (XNAS): no data");
    expect(message.text).toContain("AAPL (XNAS): Above 107 USD, 1.9 % away");
    expect(message.text).toContain("not investment advice");

    expect(message.html).toContain("Apple &lt;Inc.&gt;");
    expect(message.html).toContain('href="https://news.example.com/a?x=1&amp;y=2"');
    expect(message.html).toContain("Unsubscribe from the daily summary");
    expect(message.html).toContain("/unsubscribe?token=1.token&amp;list=digest");

    expect(message.headers).toMatchObject({
      "List-Unsubscribe": `<${process.env.CLIENT_ORIGIN}/api/auth/unsubscribe?token=1.token&list=digest>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  test("says so when nothing moved unusually and leaves out the alert section", async () => {
    const message = await send({ ...digest, movers: [], nearAlerts: [] });

    expect(message.text).toContain("None of your stocks made an unusual move today.");
    expect(message.text).not.toContain("Alerts close to triggering");
  });
});
