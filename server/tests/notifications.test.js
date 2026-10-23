const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const { clearDatabase } = require("./helpers/database");
const { createUserAccount } = require("../services/userService");

let alice;
let bob;
let aliceId;

const createUserAgent = async (username) => {
  const user = await createUserAccount({
    username,
    email: `${username}@example.com`,
    password: "password123",
    role: "user",
  });

  const agent = request.agent(app);

  const response = await agent.post("/api/auth/login").send({
    email: `${username}@example.com`,
    password: "password123",
  });

  expect(response.status).toBe(200);

  return { agent, id: user.id };
};

const createNotification = async (userId, message) => {
  const result = await pool.query(
    `INSERT INTO notifications (
      user_id,
      message,
      price,
      price_time,
      market_date
    )
    VALUES ($1, $2, 100, NOW(), CURRENT_DATE)
    RETURNING
      id`,
    [userId, message],
  );

  return result.rows[0].id;
};

beforeEach(async () => {
  await clearDatabase();

  const aliceUser = await createUserAgent("alice");

  alice = aliceUser.agent;
  aliceId = aliceUser.id;
  bob = (await createUserAgent("bob")).agent;
});

afterAll(async () => {
  await pool.end();
});

describe("Notifications API", () => {
  test("requires authentication", async () => {
    const guest = request(app);

    expect((await guest.get("/api/notifications")).status).toBe(401);
    expect(
      (await guest.patch("/api/notifications").send({ read: true })).status,
    ).toBe(401);
    expect(
      (await guest.patch("/api/notifications/1").send({ read: true })).status,
    ).toBe(401);
  });

  test("lists the newest notifications first with the unread count", async () => {
    await createNotification(aliceId, "First");
    await createNotification(aliceId, "Second");

    const response = await alice.get("/api/notifications");

    expect(response.status).toBe(200);
    expect(response.body.unreadCount).toBe(2);

    expect(
      response.body.notifications.map((notification) => notification.message),
    ).toEqual(["Second", "First"]);

    expect(response.body.notifications[0]).not.toHaveProperty("user_id");
  });

  test("limits the list", async () => {
    await createNotification(aliceId, "First");
    await createNotification(aliceId, "Second");

    const response = await alice.get("/api/notifications?limit=1");

    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.unreadCount).toBe(2);
  });

  test("marks a notification read and unread", async () => {
    const id = await createNotification(aliceId, "First");
    const url = `/api/notifications/${id}`;

    const read = await alice.patch(url).send({ read: true });

    expect(read.status).toBe(200);
    expect(read.body.notification.read_at).not.toBeNull();
    expect((await alice.get("/api/notifications")).body.unreadCount).toBe(0);

    const unread = await alice.patch(url).send({ read: false });

    expect(unread.body.notification.read_at).toBeNull();
  });

  test("keeps the first read time when marked read again", async () => {
    const id = await createNotification(aliceId, "First");
    const url = `/api/notifications/${id}`;

    const first = await alice.patch(url).send({ read: true });
    const second = await alice.patch(url).send({ read: true });

    expect(second.body.notification.read_at).toBe(
      first.body.notification.read_at,
    );
  });

  test("marks all notifications read", async () => {
    await createNotification(aliceId, "First");
    await createNotification(aliceId, "Second");

    const response = await alice.patch("/api/notifications").send({
      read: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updated: 2 });
    expect((await alice.get("/api/notifications")).body.unreadCount).toBe(0);
  });

  test("hides other users' notifications", async () => {
    const id = await createNotification(aliceId, "First");

    expect((await bob.get("/api/notifications")).body).toEqual({
      notifications: [],
      unreadCount: 0,
    });

    const response = await bob
      .patch(`/api/notifications/${id}`)
      .send({ read: true });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Notification not found" });

    await bob.patch("/api/notifications").send({ read: true });

    expect((await alice.get("/api/notifications")).body.unreadCount).toBe(1);
  });

  test.each([
    ["a missing read flag", "/api/notifications/1", {}],
    ["a string read flag", "/api/notifications/1", { read: "yes" }],
    ["an invalid ID", "/api/notifications/abc", { read: true }],
    ["marking all unread", "/api/notifications", { read: false }],
  ])("rejects %s", async (_case, url, body) => {
    const response = await alice.patch(url).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  test("rejects an invalid limit", async () => {
    const response = await alice.get("/api/notifications?limit=500");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });
});
