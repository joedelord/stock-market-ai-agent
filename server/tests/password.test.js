const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const emailService = require("../services/emailService");

const { clearDatabase } = require("./helpers/database");

const credentials = {
  username: "testuser",
  email: "test@example.com",
  password: "password123",
};

let sendResetEmail;
let sendChangedEmail;

beforeEach(async () => {
  await clearDatabase();

  sendResetEmail = vi
    .spyOn(emailService, "sendPasswordResetEmail")
    .mockResolvedValue();
  sendChangedEmail = vi
    .spyOn(emailService, "sendPasswordChangedEmail")
    .mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

const login = (password) => {
  return request(app).post("/api/auth/login").send({
    email: credentials.email,
    password,
  });
};

const requestResetToken = async () => {
  await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: credentials.email });

  const [, resetUrl] = sendResetEmail.mock.calls.at(-1);

  return new URL(resetUrl).searchParams.get("token");
};

describe("Password change", () => {
  test("changes the password and logs out other devices", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(credentials);

    const otherDevice = request.agent(app);
    await otherDevice.post("/api/auth/login").send({
      email: credentials.email,
      password: credentials.password,
    });

    const response = await agent.patch("/api/auth/password").send({
      currentPassword: "password123",
      newPassword: "newpassword456",
    });

    expect(response.status).toBe(200);

    expect((await agent.get("/api/auth/me")).status).toBe(200);
    expect((await otherDevice.get("/api/auth/me")).status).toBe(401);

    expect((await login("password123")).status).toBe(401);
    expect((await login("newpassword456")).status).toBe(200);

    expect(sendChangedEmail).toHaveBeenCalledWith(credentials.email);
  });

  test("rejects an incorrect current password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(credentials);

    const response = await agent.patch("/api/auth/password").send({
      currentPassword: "wrongpassword",
      newPassword: "newpassword456",
    });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "Current password is incorrect",
    });

    expect(sendChangedEmail).not.toHaveBeenCalled();
  });

  test("requires authentication", async () => {
    const response = await request(app).patch("/api/auth/password").send({
      currentPassword: "password123",
      newPassword: "newpassword456",
    });

    expect(response.status).toBe(401);
  });
});

describe("Password reset", () => {
  test("resets the password with an emailed token", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(credentials);

    const token = await requestResetToken();

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "newpassword456" });

    expect(response.status).toBe(200);

    expect((await agent.get("/api/auth/me")).status).toBe(401);
    expect((await login("password123")).status).toBe(401);
    expect((await login("newpassword456")).status).toBe(200);
  });

  test("gives the same answer for unknown emails without sending email", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      message:
        "If an account exists for that email, a reset link has been sent",
    });

    expect(sendResetEmail).not.toHaveBeenCalled();
  });

  test("rejects a reused token", async () => {
    await request(app).post("/api/auth/register").send(credentials);

    const token = await requestResetToken();

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "newpassword456" });

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "anotherpassword789" });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "Invalid or expired reset token",
    });
  });

  test("rejects an expired token", async () => {
    await request(app).post("/api/auth/register").send(credentials);

    const token = await requestResetToken();

    await pool.query(
      "UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute'",
    );

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "newpassword456" });

    expect(response.status).toBe(400);
  });

  test("only accepts the latest token", async () => {
    await request(app).post("/api/auth/register").send(credentials);

    const firstToken = await requestResetToken();
    await requestResetToken();

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: firstToken, password: "newpassword456" });

    expect(response.status).toBe(400);
  });
});
