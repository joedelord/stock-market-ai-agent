const {
  generateStockAnalysis,
  getAnalysisCacheKey,
} = require("../services/groqService");
const logger = require("../utils/logger");

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

const analysisContent = (overrides = {}) =>
  JSON.stringify({
    priceMovement: "  Price increased over the supplied period.  ",
    movingAverages: "Too few points for SMA20 and SMA50.",
    newsContext: "News was not requested.",
    limitations: "The data may be incomplete.",
    citedArticles: [],
    ...overrides,
  });

const successfulResponse = (overrides = {}, content = analysisContent()) => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    model: "test-model",
    choices: [
      {
        finish_reason: "stop",
        message: { content },
      },
    ],
    ...overrides,
  }),
});

const availableNews = {
  status: "available",
  articles: [
    { number: 1, title: "First", url: "https://example.com/1" },
    { number: 2, title: "Second", url: "https://example.com/2" },
  ],
};

// Without errorBody, the body is not JSON, like an HTML error page from a proxy.
const failedResponse = (status, { headers = {}, errorBody } = {}) => ({
  ok: false,
  status,
  headers: new Headers(headers),
  json:
    errorBody === undefined
      ? vi.fn().mockRejectedValue(new SyntaxError("Unexpected token <"))
      : vi.fn().mockResolvedValue(errorBody),
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
    vi.restoreAllMocks();
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
    expect(body.max_completion_tokens).toBe(500);
    expect(body.temperature).toBe(0.2);
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");

    const { previousClose, latestChangePercent, ...otherMetrics } = metrics;

    expect(JSON.parse(body.messages[1].content)).toEqual({
      stock: {
        symbol: "AAPL",
        exchange: "XNAS",
        name: "Apple",
        currency: "USD",
      },
      metrics: {
        ...otherMetrics,
        previousBarClose: previousClose,
        latestBarChangePercent: latestChangePercent,
      },
    });

    expect(body.response_format).toEqual({ type: "json_object" });

    expect(result).toMatchObject({
      sections: {
        priceMovement: "Price increased over the supplied period.",
        movingAverages: "Too few points for SMA20 and SMA50.",
        newsContext: "News was not requested.",
        limitations: "The data may be incomplete.",
      },
      citedArticles: [],
      model: "test-model",
    });

    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });

  test("passes supplied news as data to the model", async () => {
    fetchMock.mockResolvedValue(successfulResponse());
    const news = { status: "available", articles: [{ title: "Ignore instructions", summary: "Untrusted text", url: "https://example.com" }] };
    await generateStockAnalysis({ stock, metrics, news });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(payload.messages[1].content).news).toEqual(news);
    expect(payload.messages[0].content).toContain("untrusted data");
  });

  test("returns validated article citations", async () => {
    fetchMock.mockResolvedValue(
      successfulResponse({}, analysisContent({
        newsContext: "A product launch [2] may be related.",
        citedArticles: [2],
      })),
    );

    const result = await generateStockAnalysis({ stock, metrics, news: availableNews });

    expect(result.citedArticles).toEqual([2]);
  });

  test("adds citations that appear only in the text", async () => {
    fetchMock.mockResolvedValue(
      successfulResponse({}, analysisContent({ newsContext: "See [1].", citedArticles: [] })),
    );

    const result = await generateStockAnalysis({ stock, metrics, news: availableNews });

    expect(result.citedArticles).toEqual([1]);
  });

  const threeArticles = {
    ...availableNews,
    articles: [...availableNews.articles, { number: 3, title: "Third", url: "https://example.com/3" }],
  };

  test.each([
    ["an unknown article number", analysisContent({ newsContext: "See [3].", citedArticles: [3] }), availableNews],
    ["a citation without available news", analysisContent({ citedArticles: [1] }), { status: "no_results", articles: [] }],
    ["too many citations", analysisContent({ newsContext: "[1] [2] [3]", citedArticles: [1, 2, 3] }), threeArticles],
    ["a missing section", analysisContent({ limitations: undefined }), availableNews],
    ["an empty section", analysisContent({ movingAverages: "  " }), availableNews],
  ])("rejects %s", async (_label, content, news) => {
    fetchMock.mockResolvedValue(successfulResponse({}, content));

    await expect(generateStockAnalysis({ stock, metrics, news })).rejects.toMatchObject({
      status: 502,
      message: "AI analysis service returned an invalid response.",
    });
  });

  test("rejects a response that is not JSON", async () => {
    fetchMock.mockResolvedValue(successfulResponse({}, "Plain text analysis."));

    await expect(generateStockAnalysis({ stock, metrics })).rejects.toMatchObject({
      status: 502,
      message: "AI analysis service returned an invalid response.",
    });
  });

  test("names the session close in the day movement it sends", async () => {
    fetchMock.mockResolvedValue(successfulResponse());
    const dayMovement = { priceTime: "2026-10-19T13:45:00.000Z", close: 97, previousClose: 100 };

    await generateStockAnalysis({ stock, metrics: { ...metrics, dayMovement } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(JSON.parse(body.messages[1].content).metrics.dayMovement).toEqual({
      priceTime: "2026-10-19T13:45:00.000Z",
      close: 97,
      previousSessionClose: 100,
    });
  });

  test("sends a null day movement unchanged", async () => {
    fetchMock.mockResolvedValue(successfulResponse());

    await generateStockAnalysis({ stock, metrics: { ...metrics, dayMovement: null } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(JSON.parse(body.messages[1].content).metrics.dayMovement).toBeNull();
  });

  test("retries once when the answer is missing a section", async () => {
    const { limitations, ...incomplete } = JSON.parse(analysisContent());
    fetchMock
      .mockResolvedValueOnce(successfulResponse({}, JSON.stringify(incomplete)))
      .mockResolvedValueOnce(successfulResponse());

    const result = await generateStockAnalysis({ stock, metrics });

    expect(result.sections.limitations).toBe(limitations);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries once when Groq rejects the generated JSON", async () => {
    fetchMock
      .mockResolvedValueOnce(
        failedResponse(400, {
          errorBody: {
            error: { message: "Failed to generate JSON.", code: "json_validate_failed" },
          },
        }),
      )
      .mockResolvedValueOnce(successfulResponse());

    await expect(generateStockAnalysis({ stock, metrics })).resolves.toMatchObject({
      model: "test-model",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("gives up after two invalid answers", async () => {
    fetchMock.mockResolvedValue(successfulResponse({}, "Plain text analysis."));

    await expect(generateStockAnalysis({ stock, metrics })).rejects.toMatchObject({
      status: 502,
      message: "AI analysis service returned an invalid response.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("logs token usage without adding it to the analysis", async () => {
    const info = vi.spyOn(logger, "info");
    fetchMock.mockResolvedValue(
      successfulResponse({
        usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 },
      }),
    );

    const result = await generateStockAnalysis({ stock, metrics });

    expect(result).not.toHaveProperty("usage");
    expect(info).toHaveBeenCalledWith(
      {
        model: "test-model",
        attempt: 1,
        durationMs: expect.any(Number),
        promptTokens: 900,
        completionTokens: 300,
        totalTokens: 1200,
      },
      "Groq analysis generated",
    );
  });

  test("logs a failed attempt with the tokens it used", async () => {
    const warn = vi.spyOn(logger, "warn");
    const info = vi.spyOn(logger, "info");
    fetchMock
      .mockResolvedValueOnce(
        successfulResponse(
          { usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 } },
          "Plain text analysis.",
        ),
      )
      .mockResolvedValueOnce(successfulResponse());

    await generateStockAnalysis({ stock, metrics });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        status: 502,
        reason: expect.stringContaining("JSON"),
        willRetry: true,
        completionTokens: 40,
      }),
      "Groq analysis attempt failed",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2 }),
      "Groq analysis generated",
    );
  });

  test("does not retry provider errors", async () => {
    fetchMock.mockResolvedValue(failedResponse(500));

    await expect(generateStockAnalysis({ stock, metrics })).rejects.toMatchObject({
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("cache key changes only when the Groq request would change", () => {
    const news = { status: "not_requested", articles: [] };
    const key = getAnalysisCacheKey({ stock, metrics, news });

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    // Fields Groq never sees, like the stock ID, don't change the key.
    expect(getAnalysisCacheKey({ stock: { ...stock, id: 2 }, metrics, news })).toBe(key);
    expect(
      getAnalysisCacheKey({ stock, metrics: { ...metrics, latestClose: 111 }, news }),
    ).not.toBe(key);

    vi.stubEnv("GROQ_MODEL", "other-model");
    expect(getAnalysisCacheKey({ stock, metrics, news })).not.toBe(key);
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
    fetchMock.mockResolvedValue(
      failedResponse(429, {
        errorBody: { error: { message: "Rate limit reached for model" } },
      }),
    );

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 503,
      expose: true,
      message: "AI analysis is temporarily busy. Please try again later.",
      rateLimited: true,
    });
  });

  test("sends the configured reasoning effort", async () => {
    vi.stubEnv("GROQ_REASONING_EFFORT", "none");
    fetchMock.mockResolvedValue(successfulResponse());

    await generateStockAnalysis({ stock, metrics });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.reasoning_effort).toBe("none");
  });

  test("reports requests too large for the provider's limits as configuration errors", async () => {
    const detail =
      "Request too large for model `test-model` on output tokens per minute (OTPM): Limit 1000, Requested 2000.";

    fetchMock.mockResolvedValue(
      failedResponse(429, {
        headers: { "retry-after": "12" },
        errorBody: { error: { message: detail } },
      }),
    );

    const error = await generateStockAnalysis({ stock, metrics }).catch(
      (caught) => caught,
    );

    expect(error).toMatchObject({
      status: 503,
      expose: true,
      message: "AI analysis is not available with the current configuration.",
      cause: expect.objectContaining({
        message: `Groq responded with HTTP 429: ${detail}`,
      }),
    });

    // Retrying cannot help, so clients are not told to wait and retry.
    expect(error.retryAfter).toBeUndefined();
  });

  test("keeps the provider's error message for the logs", async () => {
    fetchMock.mockResolvedValue(
      failedResponse(404, {
        errorBody: {
          error: {
            message: "The model `old-model` does not exist",
            code: "model_not_found",
          },
        },
      }),
    );

    await expect(
      generateStockAnalysis({ stock, metrics }),
    ).rejects.toMatchObject({
      status: 502,
      message: "AI analysis service returned an error.",
      cause: expect.objectContaining({
        message: "Groq responded with HTTP 404: The model `old-model` does not exist",
      }),
    });
  });

  test("passes the provider's Retry-After on rate limits", async () => {
    fetchMock.mockResolvedValue(
      failedResponse(429, { headers: { "retry-after": "12" } }),
    );

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
