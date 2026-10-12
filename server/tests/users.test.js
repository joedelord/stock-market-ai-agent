const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");

const userModel = require("../models/userModel");
const { createUserAccount } = require("../services/userService");
const { clearDatabase } = require("./helpers/database");

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await pool.end();
});

const loginAs = async (role) => {
  await createUserAccount({
    username: `${role}user`,
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

describe("User management", () => {
  test("rejects duplicate usernames regardless of case", async () => {
    await request(app).post("/api/auth/register").send({
      username: "testuser",
      email: "first@example.com",
      password: "password123",
    });

    const response = await request(app).post("/api/auth/register").send({
      username: "TestUser",
      email: "second@example.com",
      password: "password123",
    });

    expect(response.status).toBe(409);

    expect(response.body).toEqual({
      error: "Username is already in use",
    });
  });

  test("validates admin user creation", async () => {
    const admin = await loginAs("admin");

    const response = await admin.post("/api/users").send({
      username: "newuser",
      email: "new@example.com",
      role: "superuser",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("applies role changes without waiting for token expiry", async () => {
    const admin = await loginAs("admin");

    expect((await admin.get("/api/users")).status).toBe(200);

    await pool.query("UPDATE users SET role = 'user' WHERE username = 'adminuser'");

    const response = await admin.get("/api/users");

    expect(response.status).toBe(403);
  });

  test("rejects tokens of deleted users", async () => {
    const admin = await loginAs("admin");

    await pool.query("DELETE FROM users WHERE username = 'adminuser'");

    const response = await admin.get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  test("keeps one admin when two admins demote each other at once", async () => {
    const first = await createUserAccount({
      username: "firstadmin",
      email: "first@example.com",
      password: "password123",
      role: "admin",
    });

    const second = await createUserAccount({
      username: "secondadmin",
      email: "second@example.com",
      password: "password123",
      role: "admin",
    });

    // Called on the model directly: over HTTP, requireAuth often rejects the
    // second request before it reaches the guard.
    const results = await Promise.allSettled([
      userModel.updateUserRole(second.id, "user"),
      userModel.updateUserRole(first.id, "user"),
    ]);

    const rejected = results.filter((result) => result.status === "rejected");

    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toBe("Cannot remove the last admin");

    const admins = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'",
    );

    expect(admins.rows[0].count).toBe(1);
  });

  test("refuses to delete the last admin", async () => {
    const admin = await createUserAccount({
      username: "onlyadmin",
      email: "only@example.com",
      password: "password123",
      role: "admin",
    });

    await expect(userModel.deleteUser(admin.id)).rejects.toThrow(
      "Cannot remove the last admin",
    );
  });

  test("paginates the user list", async () => {
    const admin = await loginAs("admin");

    // Plain inserts: these users never log in, so they need no real hash.
    await pool.query(
      `INSERT INTO users (username, email, password_hash)
       SELECT 'user' || n, 'user' || n || '@example.com', 'unused'
       FROM generate_series(1, 4) AS n`,
    );

    const response = await admin
      .get("/api/users")
      .query({ page: 2, pageSize: 2 });

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      total: 5,
      page: 2,
      pageSize: 2,
    });

    expect(response.body.users.map((user) => user.username)).toEqual([
      "user2",
      "user3",
    ]);
  });

  test("rejects an invalid page size", async () => {
    const admin = await loginAs("admin");

    const response = await admin.get("/api/users").query({ pageSize: 500 });

    expect(response.status).toBe(400);
  });

  test("shows emails to admins but not to moderators", async () => {
    const admin = await loginAs("admin");
    const moderator = await loginAs("moderator");

    const adminList = await admin.get("/api/users");
    const moderatorList = await moderator.get("/api/users");

    expect(adminList.body.users[0].email).toBe("admin@example.com");

    expect(moderatorList.body.users).toHaveLength(2);

    for (const user of moderatorList.body.users) {
      expect(user).not.toHaveProperty("email");
    }

    const moderatorSingle = await moderator.get(
      `/api/users/${adminList.body.users[0].id}`,
    );

    expect(moderatorSingle.status).toBe(200);
    expect(moderatorSingle.body).not.toHaveProperty("email");
  });

  test("updates updated_at on role changes but not on logout", async () => {
    const admin = await loginAs("admin");

    const target = await createUserAccount({
      username: "target",
      email: "target@example.com",
      password: "password123",
    });

    await pool.query(
      "UPDATE users SET updated_at = '2000-01-01T00:00:00Z' WHERE id = $1",
      [target.id],
    );

    const targetAgent = request.agent(app);

    await targetAgent.post("/api/auth/login").send({
      email: "target@example.com",
      password: "password123",
    });

    await targetAgent.post("/api/auth/logout");

    const afterLogout = await pool.query(
      "SELECT updated_at FROM users WHERE id = $1",
      [target.id],
    );

    expect(afterLogout.rows[0].updated_at.toISOString()).toBe(
      "2000-01-01T00:00:00.000Z",
    );

    await admin.patch(`/api/users/${target.id}/role`).send({ role: "moderator" });

    const afterRoleChange = await pool.query(
      "SELECT updated_at FROM users WHERE id = $1",
      [target.id],
    );

    expect(afterRoleChange.rows[0].updated_at.getFullYear()).toBeGreaterThan(
      2000,
    );
  });
});

