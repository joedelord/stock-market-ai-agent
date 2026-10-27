const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const emailService = require("../services/emailService");
const { createUserAccount } = require("../services/userService");

const { clearDatabase } = require("./helpers/database");

const credentials = {
  username: "testuser",
  email: "test@example.com",
  password: "password123",
};

let sendVerificationEmail;

beforeEach(async () => {
  await clearDatabase();

  sendVerificationEmail = vi
    .spyOn(emailService, "sendEmailVerificationEmail")
    .mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

const getLatestToken = () => {
  const [, verifyUrl] = sendVerificationEmail.mock.calls.at(-1);

  return new URL(verifyUrl).searchParams.get("token");
};

const register = async () => {
  const agent = request.agent(app);

  await agent.post("/api/auth/register").send(credentials);

  return agent;
};

describe("Email verification", () => {
  test("sends a verification link on registration", async () => {
    const agent = await register();

    expect(sendVerificationEmail).toHaveBeenCalledWith(
      credentials.email,
      expect.stringContaining("/verify-email?token="),
    );

    const response = await agent.get("/api/auth/me");

    expect(response.body.user.email_verified_at).toBeNull();
  });

  test("verifies the email with the emailed token", async () => {
    const agent = await register();

    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: getLatestToken() });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Email verified" });

    const me = await agent.get("/api/auth/me");

    expect(me.body.user.email_verified_at).not.toBeNull();
  });

  test("rejects a reused token", async () => {
    await register();

    const token = getLatestToken();

    await request(app).post("/api/auth/verify-email").send({ token });

    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ token });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Invalid or expired verification link",
    });
  });

  test("rejects an expired token", async () => {
    await register();

    const token = getLatestToken();

    await pool.query(
      "UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 minute'",
    );

    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ token });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Invalid or expired verification link",
    });
  });

  test("rejects a malformed token", async () => {
    const response = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: "not-a-token" });

    expect(response.status).toBe(400);
  });

  test("resends a new link that replaces the old one", async () => {
    const agent = await register();

    const oldToken = getLatestToken();

    const response = await agent.post("/api/auth/resend-verification");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Verification email sent" });
    expect(sendVerificationEmail).toHaveBeenCalledTimes(2);

    const oldTokenResponse = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: oldToken });

    expect(oldTokenResponse.status).toBe(400);

    const newTokenResponse = await request(app)
      .post("/api/auth/verify-email")
      .send({ token: getLatestToken() });

    expect(newTokenResponse.status).toBe(200);
  });

  test("does not resend once the email is verified", async () => {
    const agent = await register();

    await request(app)
      .post("/api/auth/verify-email")
      .send({ token: getLatestToken() });

    const response = await agent.post("/api/auth/resend-verification");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Email is already verified" });
  });

  test("requires authentication to resend", async () => {
    const response = await request(app).post("/api/auth/resend-verification");

    expect(response.status).toBe(401);
  });

  test("does not email accounts created as verified", async () => {
    const user = await createUserAccount({
      ...credentials,
      role: "admin",
      emailVerified: true,
    });

    expect(user.email_verified_at).not.toBeNull();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
