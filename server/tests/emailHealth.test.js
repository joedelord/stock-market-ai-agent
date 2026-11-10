const request = require("supertest");

const app = require("../app");
const pool = require("../config/db");
const emailService = require("../services/emailService");
const gmailApiService = require("../services/gmailApiService");

let getAccessToken;

beforeEach(() => {
  emailService.clearEmailHealthCache();

  vi.spyOn(gmailApiService, "isGmailApiConfigured").mockReturnValue(true);
  getAccessToken = vi
    .spyOn(gmailApiService, "getAccessToken")
    .mockResolvedValue("access-token");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe("Email health check", () => {
  test("reports ok when Gmail gives an access token", async () => {
    const response = await request(app).get("/api/health/email");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  test("reports failing with 503 when the refresh token is revoked", async () => {
    getAccessToken.mockRejectedValue(
      new Error("Gmail token request failed with HTTP 400: invalid_grant"),
    );

    const response = await request(app).get("/api/health/email");

    expect(response.status).toBe(503);
    // No error details on a public endpoint.
    expect(response.body).toEqual({ status: "failing" });
  });

  test("reuses the result instead of asking Google on every request", async () => {
    await request(app).get("/api/health/email");
    await request(app).get("/api/health/email");

    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  test("reports not_configured without an email provider", async () => {
    gmailApiService.isGmailApiConfigured.mockReturnValue(false);

    const response = await request(app).get("/api/health/email");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "not_configured" });
  });

  test("leaves the main health check alone", async () => {
    getAccessToken.mockRejectedValue(new Error("invalid_grant"));

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
