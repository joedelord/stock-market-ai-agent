const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");

const { clearDatabase } = require("./helpers/database");

beforeAll(() => {
  process.env.RATE_LIMITS = "on";
});

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  delete process.env.RATE_LIMITS;
  await pool.end();
});

describe("Rate limits", () => {
  test("blocks an account after repeated failed logins", async () => {
    await request(app).post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "wrongpassword",
      });

      expect(response.status).toBe(401);
    }

    // Blocked even with the right password, and regardless of email case.
    const blocked = await request(app).post("/api/auth/login").send({
      email: "TEST@example.com",
      password: "password123",
    });

    expect(blocked.status).toBe(429);

    // Other accounts from the same IP are unaffected.
    const otherAccount = await request(app).post("/api/auth/login").send({
      email: "other@example.com",
      password: "wrongpassword",
    });

    expect(otherAccount.status).toBe(401);
  });

  test("limits stock analysis requests per user", async () => {
    const agent = request.agent(app);

    await agent.post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    await agent.post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });

    // Unknown stocks keep the AI provider out of the test; requests still count.
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await agent.post("/api/stocks/999/analysis");

      expect(response.status).toBe(404);
    }

    const blocked = await agent.post("/api/stocks/999/analysis");

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: "Too many analysis requests. Please try again later.",
    });
  });
});
