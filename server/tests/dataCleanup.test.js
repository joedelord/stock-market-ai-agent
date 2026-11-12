const pool = require("../config/db");
const { clearDatabase } = require("./helpers/database");
const { createUserAccount } = require("../services/userService");
const { cleanupOldData } = require("../jobs/cleanupData");

let userId;
let stockId;

const countRows = async (table) => {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);

  return result.rows[0].count;
};

const createNotification = async (createdAt) => {
  await pool.query(
    `INSERT INTO notifications (
      user_id,
      message,
      price,
      price_time,
      market_date,
      created_at
    )
    VALUES ($1, 'Alert', 100, NOW(), CURRENT_DATE, $2)`,
    [userId, createdAt],
  );
};

const createToken = async (table, tokenHash, expiresAt) => {
  await pool.query(
    `INSERT INTO ${table} (
      user_id,
      token_hash,
      expires_at
    )
    VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
};

const createPrice = async (priceTime) => {
  await pool.query(
    `INSERT INTO stock_prices (
      stock_id,
      interval_code,
      price_time,
      open,
      high,
      low,
      close,
      volume
    )
    VALUES ($1, '15min', $2, 10, 10, 10, 10, 100)`,
    [stockId, priceTime],
  );
};

const getTokenHashes = async (table) => {
  const result = await pool.query(
    `SELECT
      token_hash
    FROM ${table}
    ORDER BY token_hash`,
  );

  return result.rows.map((row) => row.token_hash);
};

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  await clearDatabase();

  const user = await createUserAccount({
    username: "alice",
    email: "alice@example.com",
    password: "password123",
    role: "user",
  });

  userId = user.id;

  const stock = await pool.query(
    `INSERT INTO stocks (
      symbol,
      exchange,
      name,
      currency
    )
    VALUES ('AAPL', 'XNAS', 'Apple Inc.', 'USD')
    RETURNING
      id`,
  );

  stockId = stock.rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

describe("cleanupOldData", () => {
  test("deletes notifications older than 90 days", async () => {
    await createNotification(daysAgo(91));
    await createNotification(daysAgo(89));

    const deleted = await cleanupOldData();

    expect(deleted.notifications).toBe(1);
    expect(await countRows("notifications")).toBe(1);
  });

  test("deletes only expired password reset and verification tokens", async () => {
    // Registration creates a verification token of its own.
    await pool.query("DELETE FROM email_verification_tokens");

    await createToken("password_reset_tokens", "a".repeat(64), daysAgo(1));
    await createToken("password_reset_tokens", "b".repeat(64), daysAgo(-1));
    await createToken("email_verification_tokens", "c".repeat(64), daysAgo(1));
    await createToken("email_verification_tokens", "d".repeat(64), daysAgo(-1));

    const deleted = await cleanupOldData();

    expect(deleted.passwordResetTokens).toBe(1);
    expect(deleted.verificationTokens).toBe(1);
    expect(await getTokenHashes("password_reset_tokens")).toEqual([
      "b".repeat(64),
    ]);
    expect(await getTokenHashes("email_verification_tokens")).toEqual([
      "d".repeat(64),
    ]);
  });

  test("deletes stock prices older than a year", async () => {
    await createPrice(daysAgo(366));
    await createPrice(daysAgo(364));

    const deleted = await cleanupOldData();

    expect(deleted.stockPrices).toBe(1);
    expect(await countRows("stock_prices")).toBe(1);
  });

  test("deletes nothing when all data is recent", async () => {
    await createNotification(new Date());
    await createPrice(new Date());

    expect(await cleanupOldData()).toEqual({
      notifications: 0,
      passwordResetTokens: 0,
      verificationTokens: 0,
      stockPrices: 0,
    });
  });
});
