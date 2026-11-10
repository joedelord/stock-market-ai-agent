const pool = require("../config/db");
const alertModel = require("../models/alertModel");
const stockModel = require("../models/stockModel");
const userModel = require("../models/userModel");
const emailService = require("../services/emailService");
const {
  MAX_EMAIL_ATTEMPTS,
  buildAlertMessage,
  checkStockAlerts,
  retryAlertEmails,
} = require("../services/alertService");
const { createUserAccount } = require("../services/userService");
const { readUnsubscribeToken } = require("../utils/unsubscribeToken");
const { clearDatabase } = require("./helpers/database");

let user;
let stock;
let sendAlertEmail;

// 14:00 in New York on Thursday 2026-10-22.
const BAR_TIME = "2026-10-22 18:00:00";
const QUOTE_TIME = "2026-10-22T17:00:00.000Z";

const saveBar = (target, priceTime, close) =>
  stockModel.saveStockPrices(target.id, "15min", [
    {
      priceTime,
      open: close,
      high: close,
      low: close,
      close,
      volume: "1",
    },
  ]);

const saveQuote = (target, priceTime, close, previousClose) =>
  stockModel.saveStockQuote(target.id, { priceTime, close, previousClose });

const createAlert = (overrides = {}) =>
  alertModel.createAlert(user.id, {
    stockId: stock.id,
    alertType: "price_above",
    threshold: 100,
    repeatMode: "once",
    ...overrides,
  });

const getAlert = async (id) => {
  const result = await pool.query(
    `SELECT
      is_active,
      last_triggered_at,
      last_triggered_market_date::text AS market_date
    FROM stock_alerts
    WHERE id = $1`,
    [id],
  );

  return result.rows[0];
};

const getNotifications = async () => {
  const result = await pool.query(
    `SELECT
      user_id,
      alert_id,
      message,
      price,
      daily_change_percent,
      market_date::text AS market_date
    FROM notifications
    ORDER BY id`,
  );

  return result.rows;
};

const getEmailStates = async () => {
  const result = await pool.query(
    `SELECT
      email_status,
      email_attempts
    FROM notifications
    ORDER BY id`,
  );

  return result.rows;
};

// Moves the last attempts back past the retry delay.
const makeRetriesDue = () =>
  pool.query(
    `UPDATE notifications
    SET
      email_last_attempt_at = email_last_attempt_at - INTERVAL '1 hour'
    WHERE email_last_attempt_at IS NOT NULL`,
  );

beforeEach(async () => {
  await clearDatabase();

  sendAlertEmail = vi
    .spyOn(emailService, "sendAlertNotificationEmail")
    .mockResolvedValue();

  user = await createUserAccount({
    username: "alice",
    email: "alice@example.com",
    password: "password123",
    role: "user",
    emailVerified: true,
  });

  stock = await stockModel.createStock({
    symbol: "AAPL",
    exchange: "XNAS",
    name: "Apple",
    currency: "USD",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe("Alert triggers", () => {
  test("does nothing without any price", async () => {
    await createAlert();

    expect(await checkStockAlerts(stock)).toEqual([]);
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  test("emails the user when an alert fires", async () => {
    await createAlert();

    await saveBar(stock, BAR_TIME, "105");

    await checkStockAlerts(stock);

    expect(sendAlertEmail).toHaveBeenCalledWith(
      "alice@example.com",
      "AAPL (XNAS) is at 105.00 USD, at or above your alert of 100 USD.",
      expect.any(String),
    );

    const [, , unsubscribeToken] = sendAlertEmail.mock.calls[0];

    expect(readUnsubscribeToken(unsubscribeToken)).toBe(user.id);
    expect(await getEmailStates()).toEqual([
      { email_status: "sent", email_attempts: 1 },
    ]);
  });

  test("does not email a user who turned alert emails off", async () => {
    await userModel.updateEmailAlertsEnabled(user.id, false);
    await createAlert();

    await saveBar(stock, BAR_TIME, "105");

    expect(await checkStockAlerts(stock)).toHaveLength(1);
    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(await getEmailStates()).toEqual([
      { email_status: "none", email_attempts: 0 },
    ]);
  });

  test("does not email a user whose address is not verified", async () => {
    const unverified = await createUserAccount({
      username: "bob",
      email: "bob@example.com",
      password: "password123",
      role: "user",
    });

    await alertModel.createAlert(unverified.id, {
      stockId: stock.id,
      alertType: "price_above",
      threshold: 100,
      repeatMode: "once",
    });

    await saveBar(stock, BAR_TIME, "105");

    expect(await checkStockAlerts(stock)).toHaveLength(1);
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  test("keeps the notification when the email fails", async () => {
    await createAlert();
    sendAlertEmail.mockRejectedValue(new Error("SMTP down"));

    await saveBar(stock, BAR_TIME, "105");

    expect(await checkStockAlerts(stock)).toHaveLength(1);
    expect(await getNotifications()).toHaveLength(1);
    expect(await getEmailStates()).toEqual([
      { email_status: "pending", email_attempts: 1 },
    ]);
  });

  test("retries a failed email after the retry delay", async () => {
    await createAlert();
    sendAlertEmail.mockRejectedValueOnce(new Error("SMTP down"));

    await saveBar(stock, BAR_TIME, "105");
    await checkStockAlerts(stock);

    // Too soon: the failed email waits for the retry delay.
    expect(await retryAlertEmails()).toMatchObject({ sent: 0, failed: 0 });

    await makeRetriesDue();

    expect(await retryAlertEmails()).toMatchObject({ sent: 1, failed: 0 });
    expect(sendAlertEmail).toHaveBeenCalledTimes(2);
    expect(await getEmailStates()).toEqual([
      { email_status: "sent", email_attempts: 2 },
    ]);
  });

  test("gives up on an email after the last attempt", async () => {
    await createAlert();
    sendAlertEmail.mockRejectedValue(new Error("SMTP down"));

    await saveBar(stock, BAR_TIME, "105");
    await checkStockAlerts(stock);

    for (let attempt = 2; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
      await makeRetriesDue();
      await retryAlertEmails();
    }

    expect(await getEmailStates()).toEqual([
      { email_status: "failed", email_attempts: MAX_EMAIL_ATTEMPTS },
    ]);

    await makeRetriesDue();
    await retryAlertEmails();

    expect(sendAlertEmail).toHaveBeenCalledTimes(MAX_EMAIL_ATTEMPTS);
  });

  test("stops sending at a rate limit and sends the rest later", async () => {
    const bob = await createUserAccount({
      username: "bob",
      email: "bob@example.com",
      password: "password123",
      role: "user",
      emailVerified: true,
    });

    await createAlert();
    await alertModel.createAlert(bob.id, {
      stockId: stock.id,
      alertType: "price_above",
      threshold: 100,
      repeatMode: "once",
    });

    sendAlertEmail.mockRejectedValueOnce(
      Object.assign(new Error("Too many requests"), { status: 429 }),
    );

    await saveBar(stock, BAR_TIME, "105");
    await checkStockAlerts(stock);

    // Bob's email was not even tried after the rate limit.
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(await getEmailStates()).toEqual([
      { email_status: "pending", email_attempts: 1 },
      { email_status: "pending", email_attempts: 0 },
    ]);

    await makeRetriesDue();

    expect(await retryAlertEmails()).toMatchObject({ sent: 2 });
    expect(await getEmailStates()).toEqual([
      { email_status: "sent", email_attempts: 2 },
      { email_status: "sent", email_attempts: 1 },
    ]);
  });

  test("does not retry for a user who turned alert emails off", async () => {
    await createAlert();
    sendAlertEmail.mockRejectedValueOnce(new Error("SMTP down"));

    await saveBar(stock, BAR_TIME, "105");
    await checkStockAlerts(stock);

    await userModel.updateEmailAlertsEnabled(user.id, false);
    await makeRetriesDue();

    expect(await retryAlertEmails()).toMatchObject({ sent: 0, cancelled: 1 });
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(await getEmailStates()).toEqual([
      { email_status: "none", email_attempts: 2 },
    ]);
  });

  test("gives up on emails older than a day", async () => {
    await createAlert();
    sendAlertEmail.mockRejectedValueOnce(new Error("SMTP down"));

    await saveBar(stock, BAR_TIME, "105");
    await checkStockAlerts(stock);

    await pool.query(
      `UPDATE notifications
      SET
        created_at = NOW() - INTERVAL '25 hours',
        email_last_attempt_at = NOW() - INTERVAL '25 hours'`,
    );

    await retryAlertEmails();

    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(await getEmailStates()).toEqual([
      { email_status: "failed", email_attempts: 1 },
    ]);
  });

  test("fires a price_above alert once and switches it off", async () => {
    const alert = await createAlert();

    await saveBar(stock, BAR_TIME, "105");

    const created = await checkStockAlerts(stock);

    expect(created).toHaveLength(1);

    expect(await getNotifications()).toEqual([
      {
        user_id: user.id,
        alert_id: alert.id,
        message:
          "AAPL (XNAS) is at 105.00 USD, at or above your alert of 100 USD.",
        price: "105.000000",
        daily_change_percent: null,
        market_date: "2026-10-22",
      },
    ]);

    expect(await getAlert(alert.id)).toMatchObject({
      is_active: false,
      market_date: "2026-10-22",
    });

    expect(await checkStockAlerts(stock)).toEqual([]);
  });

  test("does not fire when the price does not meet the rule", async () => {
    await createAlert({ alertType: "price_below", threshold: 100 });

    await saveBar(stock, BAR_TIME, "105");

    expect(await checkStockAlerts(stock)).toEqual([]);
    expect(await getNotifications()).toEqual([]);
  });

  test("does not fire a paused alert", async () => {
    const alert = await createAlert();

    await alertModel.updateAlert(user.id, alert.id, { isActive: false });
    await saveBar(stock, BAR_TIME, "105");

    expect(await checkStockAlerts(stock)).toEqual([]);
  });

  test("fires a daily alert at most once per market day", async () => {
    const alert = await createAlert({ repeatMode: "daily" });

    await saveBar(stock, BAR_TIME, "105");

    expect(await checkStockAlerts(stock)).toHaveLength(1);
    expect(await checkStockAlerts(stock)).toEqual([]);
    expect((await getAlert(alert.id)).is_active).toBe(true);

    await saveBar(stock, "2026-10-23 18:00:00", "106");

    expect(await checkStockAlerts(stock)).toHaveLength(1);

    expect(
      (await getNotifications()).map(
        (notification) => notification.market_date,
      ),
    ).toEqual(["2026-10-22", "2026-10-23"]);
  });

  test("uses the newer of the latest bar and the quote", async () => {
    await createAlert({ alertType: "price_below", threshold: 100 });

    await saveQuote(stock, QUOTE_TIME, 99, 98);
    await saveBar(stock, BAR_TIME, "105");

    expect(await checkStockAlerts(stock)).toEqual([]);

    await saveQuote(stock, "2026-10-22T19:00:00.000Z", 99, 98);

    expect(await checkStockAlerts(stock)).toHaveLength(1);
  });

  test("fires daily change alerts against the quote's previous close", async () => {
    await createAlert({ alertType: "daily_change_above", threshold: 10 });
    await createAlert({ alertType: "daily_change_below", threshold: -1 });

    await saveQuote(stock, QUOTE_TIME, 100, 95);
    await saveBar(stock, BAR_TIME, "105");

    const created = await checkStockAlerts(stock);

    expect(created).toHaveLength(1);

    const [notification] = await getNotifications();

    expect(Number(notification.daily_change_percent)).toBeCloseTo(10.526316, 6);
    expect(notification.message).toBe(
      "AAPL (XNAS) has changed +10.53 % today, at or above your alert of +10.00 %.",
    );
  });

  test("fires a daily_change_below alert", async () => {
    await createAlert({ alertType: "daily_change_below", threshold: -5 });

    await saveQuote(stock, QUOTE_TIME, 90, 100);

    expect(await checkStockAlerts(stock)).toHaveLength(1);

    expect((await getNotifications())[0].message).toBe(
      "AAPL (XNAS) has changed -10.00 % today, at or below your alert of -5.00 %.",
    );
  });

  test("ignores a previous close from an earlier market day", async () => {
    await createAlert({ alertType: "daily_change_above", threshold: 1 });

    await saveQuote(stock, QUOTE_TIME, 100, 95);
    await saveBar(stock, "2026-10-23 18:00:00", "105");

    expect(await checkStockAlerts(stock)).toEqual([]);
  });

  test("uses the exchange's local date as the market day", async () => {
    const nokia = await stockModel.createStock({
      symbol: "NOKIA",
      exchange: "XHEL",
      name: "Nokia",
      currency: "EUR",
    });

    await alertModel.createAlert(user.id, {
      stockId: nokia.id,
      alertType: "price_above",
      threshold: 4,
      repeatMode: "once",
    });

    // 01:30 on 2026-10-23 in Helsinki.
    await saveBar(nokia, "2026-10-22 22:30:00", "5");

    await checkStockAlerts(nokia);

    expect((await getNotifications())[0].market_date).toBe("2026-10-23");
  });

  test("creates one notification when two checks run at once", async () => {
    await createAlert({ repeatMode: "daily" });

    await saveBar(stock, BAR_TIME, "105");

    const results = await Promise.all([
      checkStockAlerts(stock),
      checkStockAlerts(stock),
    ]);

    expect(results.flat()).toHaveLength(1);
    expect(await getNotifications()).toHaveLength(1);
  });

  test("a resumed once alert can fire again the same day", async () => {
    const alert = await createAlert();

    await saveBar(stock, BAR_TIME, "105");
    await checkStockAlerts(stock);

    await alertModel.updateAlert(user.id, alert.id, { isActive: true });

    expect((await getAlert(alert.id)).market_date).toBeNull();
    expect(await checkStockAlerts(stock)).toHaveLength(1);
  });

  test("a changed rule can fire again the same day", async () => {
    const alert = await createAlert({ repeatMode: "daily" });

    await saveBar(stock, BAR_TIME, "105");
    await checkStockAlerts(stock);

    await alertModel.updateAlert(user.id, alert.id, {
      alertType: "price_above",
      threshold: 104,
      repeatMode: "daily",
    });

    expect(await checkStockAlerts(stock)).toHaveLength(1);
  });

  test("tracks prices for stocks with active alerts", async () => {
    const getTrackedIds = async () =>
      (await stockModel.getTrackedStocks()).map((tracked) => tracked.id);

    expect(await getTrackedIds()).toEqual([]);

    const alert = await createAlert();

    expect(await getTrackedIds()).toEqual([stock.id]);

    await alertModel.updateAlert(user.id, alert.id, { isActive: false });

    expect(await getTrackedIds()).toEqual([]);
  });

  test("builds price messages with the stock's currency", () => {
    expect(
      buildAlertMessage(
        { symbol: "NOKIA", exchange: "XHEL", currency: "EUR" },
        { alert_type: "price_below", threshold: "4.250000" },
        "4.1",
      ),
    ).toBe("NOKIA (XHEL) is at 4.10 EUR, at or below your alert of 4.25 EUR.");
  });
});
