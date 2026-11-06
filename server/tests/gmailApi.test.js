const emailService = require("../services/emailService");
const gmailApiService = require("../services/gmailApiService");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
});

const tokenResponse = (accessToken = "access-token-1") =>
  jsonResponse(200, { access_token: accessToken, expires_in: 3599 });

const sentResponse = () =>
  jsonResponse(200, { id: "message-id", threadId: "thread-id" });

const decodeRawMessage = (options) =>
  Buffer.from(JSON.parse(options.body).raw, "base64url").toString("utf8");

describe("Gmail API email delivery", () => {
  let fetchMock;

  beforeEach(() => {
    vi.stubEnv("GMAIL_CLIENT_ID", "client-id");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("MAIL_FROM", "Stock Market AI <alerts@gmail.com>");

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    gmailApiService.clearAccessToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    gmailApiService.clearAccessToken();
  });

  test("sends the email through the Gmail API with a fresh access token", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(sentResponse());

    const result = await emailService.sendAlertNotificationEmail(
      "user@example.com",
      "AAPL is at 205.00 USD.",
    );

    expect(result).toEqual({ id: "message-id", threadId: "thread-id" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenOptions] = fetchMock.mock.calls[0];

    expect(tokenUrl).toBe(TOKEN_URL);
    expect(Object.fromEntries(tokenOptions.body)).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      refresh_token: "refresh-token",
      grant_type: "refresh_token",
    });

    const [sendUrl, sendOptions] = fetchMock.mock.calls[1];

    expect(sendUrl).toBe(SEND_URL);
    expect(sendOptions.headers.Authorization).toBe("Bearer access-token-1");
    expect(sendOptions.signal).toBeInstanceOf(AbortSignal);

    const rawMessage = decodeRawMessage(sendOptions);

    expect(rawMessage).toContain("From: Stock Market AI <alerts@gmail.com>");
    expect(rawMessage).toContain("To: user@example.com");
    expect(rawMessage).toContain("Subject: Stock Market AI: stock alert triggered");
  });

  test("reuses the access token until it expires", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(sentResponse())
      .mockResolvedValueOnce(sentResponse());

    await emailService.sendPasswordChangedEmail("user@example.com");
    await emailService.sendPasswordChangedEmail("user@example.com");

    const urls = fetchMock.mock.calls.map(([url]) => url);

    expect(urls).toEqual([TOKEN_URL, SEND_URL, SEND_URL]);
  });

  test("reports why the token request failed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      }),
    );

    await expect(
      emailService.sendPasswordChangedEmail("user@example.com"),
    ).rejects.toThrow(
      "Gmail token request failed with HTTP 400: Token has been expired or revoked.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("fetches a new access token after the old one is rejected", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("access-token-1"))
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { message: "Invalid Credentials" } }),
      )
      .mockResolvedValueOnce(tokenResponse("access-token-2"))
      .mockResolvedValueOnce(sentResponse());

    await expect(
      emailService.sendPasswordChangedEmail("user@example.com"),
    ).rejects.toThrow("Gmail send failed with HTTP 401: Invalid Credentials");

    await emailService.sendPasswordChangedEmail("user@example.com");

    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe(
      "Bearer access-token-2",
    );
  });

  test("fails at startup when only some Gmail variables are set", () => {
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "");
    const envPath = require.resolve("../config/env");
    delete require.cache[envPath];

    try {
      expect(() => require("../config/env")).toThrow(
        "Missing required environment variables in .env.test: GMAIL_REFRESH_TOKEN",
      );
    } finally {
      delete require.cache[envPath];
    }
  });
});
