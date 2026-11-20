const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const emailService = require("../services/emailService");
const { createUnsubscribeToken } = require("../utils/unsubscribeToken");

const { clearDatabase } = require("./helpers/database");

const credentials = {
  username: "testuser",
  email: "test@example.com",
  password: "password123",
};

beforeEach(async () => {
  await clearDatabase();

  vi.spyOn(emailService, "sendEmailVerificationEmail").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

const register = async () => {
  const agent = request.agent(app);

  const response = await agent.post("/api/auth/register").send(credentials);

  return { agent, user: response.body.user };
};

const getEmailPreferences = async (userId) => {
  const result = await pool.query(
    `SELECT
      email_alerts_enabled,
      email_digest_enabled
    FROM users
    WHERE id = $1`,
    [userId],
  );

  return result.rows[0];
};

const getEmailAlertsEnabled = async (userId) => {
  const result = await pool.query(
    `SELECT
      email_alerts_enabled
    FROM users
    WHERE id = $1`,
    [userId],
  );

  return result.rows[0].email_alerts_enabled;
};

describe("Email preferences", () => {
  test("alert emails are on for a new account", async () => {
    const { agent, user } = await register();

    expect(user.email_alerts_enabled).toBe(true);

    const me = await agent.get("/api/auth/me");

    expect(me.body.user.email_alerts_enabled).toBe(true);
  });

  test("turns alert emails off and on again", async () => {
    const { agent } = await register();

    const off = await agent
      .patch("/api/auth/me/email-preferences")
      .send({ emailAlertsEnabled: false });

    expect(off.status).toBe(200);
    expect(off.body.user.email_alerts_enabled).toBe(false);
    expect(off.body.user).not.toHaveProperty("password_hash");

    const on = await agent
      .patch("/api/auth/me/email-preferences")
      .send({ emailAlertsEnabled: true });

    expect(on.body.user.email_alerts_enabled).toBe(true);
  });

  test("the daily summary is off for a new account", async () => {
    const { user } = await register();

    expect(user.email_digest_enabled).toBe(false);
  });

  test("changes the daily summary without touching alert emails", async () => {
    const { agent, user } = await register();

    const response = await agent
      .patch("/api/auth/me/email-preferences")
      .send({ emailDigestEnabled: true });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email_alerts_enabled: true,
      email_digest_enabled: true,
    });
    expect(await getEmailPreferences(user.id)).toEqual({
      email_alerts_enabled: true,
      email_digest_enabled: true,
    });
  });

  test("rejects a request without any preference", async () => {
    const { agent } = await register();

    const response = await agent
      .patch("/api/auth/me/email-preferences")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual([
      { field: "body", message: "Choose at least one email preference" },
    ]);
  });

  test("rejects a value that is not a boolean", async () => {
    const { agent } = await register();

    const response = await agent
      .patch("/api/auth/me/email-preferences")
      .send({ emailAlertsEnabled: "no" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("requires authentication", async () => {
    const response = await request(app)
      .patch("/api/auth/me/email-preferences")
      .send({ emailAlertsEnabled: false });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
  });
});

describe("Unsubscribe link", () => {
  test("turns alert emails off without logging in", async () => {
    const { user } = await register();

    const response = await request(app)
      .post("/api/auth/unsubscribe")
      .query({ token: createUnsubscribeToken(user.id) });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Alert emails turned off" });
    expect(await getEmailAlertsEnabled(user.id)).toBe(false);
  });

  // RFC 8058: the provider POSTs this form body to the List-Unsubscribe URL.
  test("accepts a one-click unsubscribe from an email provider", async () => {
    const { user } = await register();

    const response = await request(app)
      .post(`/api/auth/unsubscribe?token=${createUnsubscribeToken(user.id)}`)
      .type("form")
      .send("List-Unsubscribe=One-Click");

    expect(response.status).toBe(200);
    expect(await getEmailAlertsEnabled(user.id)).toBe(false);
  });

  test("rejects a forged token", async () => {
    const { user } = await register();
    const [, signature] = createUnsubscribeToken(user.id).split(".");

    const response = await request(app)
      .post("/api/auth/unsubscribe")
      .query({ token: `${user.id + 1}.${signature}` });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid unsubscribe link" });
    expect(await getEmailAlertsEnabled(user.id)).toBe(true);
  });

  test("turns off only the daily summary with a digest link", async () => {
    const { agent, user } = await register();

    await agent
      .patch("/api/auth/me/email-preferences")
      .send({ emailDigestEnabled: true });

    const response = await request(app)
      .post("/api/auth/unsubscribe")
      .query({ token: createUnsubscribeToken(user.id, "digest"), list: "digest" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Daily summary emails turned off" });
    expect(await getEmailPreferences(user.id)).toEqual({
      email_alerts_enabled: true,
      email_digest_enabled: false,
    });
  });

  test("rejects a token made for the other list", async () => {
    const { user } = await register();

    const response = await request(app)
      .post("/api/auth/unsubscribe")
      .query({ token: createUnsubscribeToken(user.id), list: "digest" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid unsubscribe link" });
  });

  test("rejects an unknown list", async () => {
    const { user } = await register();

    const response = await request(app)
      .post("/api/auth/unsubscribe")
      .query({ token: createUnsubscribeToken(user.id), list: "news" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("rejects a malformed token", async () => {
    const response = await request(app)
      .post("/api/auth/unsubscribe")
      .query({ token: "not-a-token" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("cannot be used as a login token", async () => {
    const { user } = await register();

    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `auth_token=${createUnsubscribeToken(user.id)}`);

    expect(response.status).toBe(401);
  });
});
