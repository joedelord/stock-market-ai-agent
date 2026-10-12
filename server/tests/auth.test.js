const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");

const { clearDatabase } = require("./helpers/database");

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await pool.end();
});

describe("Authentication", () => {
  test("registers a new user", async () => {
    const response = await request(app).post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    expect(response.status).toBe(201);

    expect(response.body.user).toMatchObject({
      id: 1,
      username: "testuser",
      email: "test@example.com",
      role: "user",
    });

    expect(response.body.user.password_hash).toBeUndefined();
  });

  test("rejects invalid registration data", async () => {
    const response = await request(app).post("/api/auth/register").send({
      username: "a",
      email: "not-an-email",
      password: "123",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("logs in with correct credentials", async () => {
    await request(app).post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });

    expect(response.status).toBe(200);

    expect(response.body.user.email).toBe("test@example.com");

    expect(response.headers["set-cookie"]).toBeDefined();
  });

  test("rejects incorrect password", async () => {
    await request(app).post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "wrongpassword",
    });

    expect(response.status).toBe(401);

    expect(response.body).toEqual({
      error: "Invalid email or password",
    });
  });

  test("returns current authenticated user", async () => {
    const agent = request.agent(app);

    await agent.post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    const response = await agent.get("/api/auth/me");

    expect(response.status).toBe(200);

    expect(response.body.user).toMatchObject({
      id: 1,
      username: "testuser",
      email: "test@example.com",
      role: "user",
    });
  });
  test("rejects unauthenticated /me request", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });
  test("logs user out", async () => {
    const agent = request.agent(app);

    await agent.post("/api/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    const logoutResponse = await agent.post("/api/auth/logout");

    expect(logoutResponse.status).toBe(200);

    const meResponse = await agent.get("/api/auth/me");

    expect(meResponse.status).toBe(401);
  });

  test("rejects a copied token after logout", async () => {
    const registerResponse = await request(app)
      .post("/api/auth/register")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
      });

    const cookie = registerResponse.headers["set-cookie"];

    await request(app).post("/api/auth/logout").set("Cookie", cookie);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(401);
  });
});
