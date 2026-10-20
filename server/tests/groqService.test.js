const { generateStockAnalysis } = require("../services/groqService");

const stock = {
  id: 1,
  symbol: "AAPL",
  exchange: "XNAS",
  name: "Apple",
  currency: "USD",
};

const metrics = {
  interval: "15min",
  pointCount: 2,
  periodStart: "2026-10-19T13:30:00.000Z",
  periodEnd: "2026-10-19T13:45:00.000Z",
  firstClose: 100,
  latestClose: 110,
  previousClose: 100,
  latestChangePercent: 10,
  periodChangePercent: 10,
  minClose: 100,
  maxClose: 110,
  sma20: null,
  sma50: null,
};

const successfulResponse = (overrides = {}) => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    model: "test-model",
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: "  Price increased over the supplied period.  ",
        },
      },
    ],
    ...overrides,
  }),
});

const failedResponse = (status, headers = {}) => ({
  ok: false,
  status,
  headers: new Headers(headers),
  body: {
    cancel: vi.fn().mockResolvedValue(undefined),
  },
  json: vi.fn(),
});

describe("Groq Service", () => {
  let fetchMock;

  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-api-key");
    vi.stubEnv("GROQ_MODEL", "test-model");

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("sends stock metrics and returns a trimmed analysis", async () => {
    fetchMock.mockResolvedValue(successfulResponse());

    const result = await generateStockAnalysis({ stock, metrics });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");

    expect(options).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
      },
    });

    expect(options.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(options.body);

    expect(body.model).toBe("test-model");
    expect(body.max_completion_tokens).toBe(800);
    expect(body.temperature).toBe(0.2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");

    expect(JSON.parse(body.messages[1].content)).toEqual({
      stock: {
        symbol: "AAPL",
        exchange: "XNAS",
        name: "Apple",
        currency: "USD",
      },
      metrics,
    });

    expect(result).toMatchObject({
      text: "Price increased over the supplied period.",
      model: "test-model",
    });

    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });

  test.each(["GROQ_API_KEY", "GROQ_MODEL"])(
    "rejects missing configuration: %s",
    async (variable) => {
      vi.stubEnv(variable, "   ");

      await expect(
        generateStockAnalysis({ stock, metrics }),
      ).rejects.toMatchObject({
        status: 503,
        expose: true,
        message: "AI analysis is not configured.",
      });

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("handles provider rate limits without exposing the raw error", async () => {
    const response = failedResponse(429);
    fetchMock.mockResolvedValue(response);

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 503,
      expose: true,
      message: "AI analysis is temporarily busy. Please try again later.",
    });

    expect(response.body.cancel).toHaveBeenCalledOnce();
    expect(response.json).not.toHaveBeenCalled();
  });

  test("passes the provider's Retry-After on rate limits", async () => {
    fetchMock.mockResolvedValue(failedResponse(429, { "retry-after": "12" }));

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 503,
      retryAfter: "12",
    });
  });

  test.each([400, 401, 403, 500, 503])(
    "handles provider HTTP status %s",
    async (status) => {
      fetchMock.mockResolvedValue(failedResponse(status));

      await expect(
        generateStockAnalysis({ stock, metrics }),
      ).rejects.toMatchObject({
        status: 502,
        expose: true,
        message: "AI analysis service returned an error.",
        cause: expect.objectContaining({
          message: `Groq responded with HTTP ${status}`,
        }),
      });
    },
  );

  test.each(["TimeoutError", "AbortError"])("handles %s", async (name) => {
    const error = new Error("Request interrupted");
    error.name = name;

    fetchMock.mockRejectedValue(error);

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 504,
      expose: true,
      message: "AI analysis timed out. Please try again.",
    });
  });

  test("handles network failures", async () => {
    const networkError = new TypeError("fetch failed");
    fetchMock.mockRejectedValue(networkError);

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 502,
      expose: true,
      message: "AI analysis service could not be reached.",
      cause: networkError,
    });
  });

  test("handles a timeout while reading the response body", async () => {
    const error = new Error("Body read timed out");
    error.name = "TimeoutError";

    const response = successfulResponse();
    response.json.mockRejectedValue(error);

    fetchMock.mockResolvedValue(response);

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 504,
      expose: true,
      message: "AI analysis timed out. Please try again.",
    });
  });

  test("handles invalid JSON from the provider", async () => {
    const syntaxError = new SyntaxError("Invalid JSON");
    const response = successfulResponse();
    response.json.mockRejectedValue(syntaxError);

    fetchMock.mockResolvedValue(response);

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 502,
      expose: true,
      message: "AI analysis service returned an incomplete response.",
      cause: syntaxError,
    });
  });

  test.each([
    ["missing choices", {}],
    ["empty choices", { choices: [] }],
    [
      "blank content",
      {
        choices: [
          {
            finish_reason: "stop",
            message: { content: "   " },
          },
        ],
      },
    ],
    [
      "missing content",
      {
        choices: [
          {
            finish_reason: "stop",
            message: {},
          },
        ],
      },
    ],
    [
      "truncated output",
      {
        choices: [
          {
            finish_reason: "length",
            message: { content: "Incomplete analysis" },
          },
        ],
      },
    ],
  ])("rejects %s", async (_, data) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(data),
    });

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 502,
      expose: true,
      message: "AI analysis service returned an incomplete response.",
    });
  });

  test("uses the configured model when the response omits it", async () => {
    fetchMock.mockResolvedValue(successfulResponse({ model: undefined }));

    const result = await generateStockAnalysis({ stock, metrics });

    expect(result.model).toBe("test-model");
  });
});
