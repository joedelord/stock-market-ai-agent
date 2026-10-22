const marketDataService = require("../services/marketDataService");

const originalApiKey = process.env.TWELVE_DATA_API_KEY;

const mockResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(data),
});

describe("Market Data Service", () => {
  beforeEach(() => {
    process.env.TWELVE_DATA_API_KEY = "test-api-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.TWELVE_DATA_API_KEY;
    } else {
      process.env.TWELVE_DATA_API_KEY = originalApiKey;
    }
  });

  test("fetches and normalizes stock prices", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        meta: { symbol: "AAPL" },
        values: [
          {
            datetime: "2026-10-12 19:45:00",
            open: "340.65",
            high: "341.16",
            low: "340.22",
            close: "341.06",
            volume: "2082898",
          },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await marketDataService.fetchStockPrices({
      symbol: "AAPL",
      exchange: "XNAS",
      interval: "15min",
      outputSize: 5,
    });

    expect(result).toEqual({
      symbol: "AAPL",
      interval: "15min",
      prices: [
        {
          priceTime: "2026-10-12 19:45:00",
          open: "340.65",
          high: "341.16",
          low: "340.22",
          close: "341.06",
          volume: "2082898",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(url);

    expect(parsedUrl.pathname).toBe("/time_series");
    expect(parsedUrl.searchParams.get("symbol")).toBe("AAPL");
    expect(parsedUrl.searchParams.get("exchange")).toBe("NASDAQ");
    expect(parsedUrl.searchParams.get("interval")).toBe("15min");
    expect(parsedUrl.searchParams.get("outputsize")).toBe("5");
    expect(parsedUrl.searchParams.get("timezone")).toBe("UTC");
    expect(parsedUrl.searchParams.get("apikey")).toBe("test-api-key");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test("maps Helsinki exchange correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ values: [] }));

    vi.stubGlobal("fetch", fetchMock);

    await marketDataService.fetchStockPrices({
      symbol: "NOKIA",
      exchange: "XHEL",
    });

    const url = new URL(fetchMock.mock.calls[0][0]);

    expect(url.searchParams.get("symbol")).toBe("NOKIA");
    expect(url.searchParams.get("exchange")).toBe("OMXH");
  });

  test("uses default interval and output size", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ values: [] }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await marketDataService.fetchStockPrices({
      symbol: "AAPL",
      exchange: "XNAS",
    });

    const url = new URL(fetchMock.mock.calls[0][0]);

    expect(url.searchParams.get("interval")).toBe("15min");
    expect(url.searchParams.get("outputsize")).toBe("30");
    expect(result.interval).toBe("15min");
  });

  test("falls back to requested symbol and null volume", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          values: [
            {
              datetime: "2026-10-12 19:45:00",
              open: "10.00",
              high: "10.50",
              low: "9.90",
              close: "10.20",
            },
          ],
        }),
      ),
    );

    const result = await marketDataService.fetchStockPrices({
      symbol: "NOKIA",
      exchange: "XHEL",
    });

    expect(result.symbol).toBe("NOKIA");
    expect(result.prices[0].volume).toBeNull();
  });

  test("rejects unsupported exchanges without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      marketDataService.fetchStockPrices({
        symbol: "AAPL",
        exchange: "XLON",
      }),
    ).rejects.toThrow("Unsupported exchange: XLON");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("handles Twelve Data API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          status: "error",
          message: "API credits exceeded",
        }),
      ),
    );

    await expect(
      marketDataService.fetchStockPrices({
        symbol: "AAPL",
        exchange: "XNAS",
      }),
    ).rejects.toThrow("API credits exceeded");
  });

  test("prefers the API error message over the HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(
          {
            status: "error",
            message: "Too many requests",
          },
          429,
        ),
      ),
    );

    await expect(
      marketDataService.fetchStockPrices({
        symbol: "AAPL",
        exchange: "XNAS",
      }),
    ).rejects.toThrow("Too many requests");
  });

  test("uses a generic message when the API error has none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ status: "error" })),
    );

    await expect(
      marketDataService.fetchStockPrices({
        symbol: "AAPL",
        exchange: "XNAS",
      }),
    ).rejects.toThrow("Twelve Data request failed");
  });

  test("handles HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(null, 500)));

    await expect(
      marketDataService.fetchStockPrices({
        symbol: "AAPL",
        exchange: "XNAS",
      }),
    ).rejects.toThrow("Twelve Data HTTP error: 500");
  });

  test("rejects invalid API responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ unexpected: true })),
    );

    await expect(
      marketDataService.fetchStockPrices({
        symbol: "AAPL",
        exchange: "XNAS",
      }),
    ).rejects.toThrow("Invalid Twelve Data response");
  });

  test("rejects requests without an API key", async () => {
    delete process.env.TWELVE_DATA_API_KEY;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      marketDataService.fetchStockPrices({
        symbol: "AAPL",
        exchange: "XNAS",
      }),
    ).rejects.toThrow("TWELVE_DATA_API_KEY is missing");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("searches stock symbols", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        data: [
          {
            symbol: "NOKIA",
            exchange: "OMXH",
            country: "Finland",
          },
        ],
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await marketDataService.searchStocks("NOKIA");

    expect(result).toEqual([
      {
        symbol: "NOKIA",
        exchange: "OMXH",
        country: "Finland",
      },
    ]);

    const url = new URL(fetchMock.mock.calls[0][0]);

    expect(url.pathname).toBe("/symbol_search");
    expect(url.searchParams.get("symbol")).toBe("NOKIA");
    expect(url.searchParams.get("apikey")).toBe("test-api-key");
  });

  test("returns an empty list when search has no data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({})));

    const result = await marketDataService.searchStocks("UNKNOWN");

    expect(result).toEqual([]);
  });

  test("passes abort signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ values: [] }));

    vi.stubGlobal("fetch", fetchMock);

    await marketDataService.fetchStockPrices({
      symbol: "AAPL",
      exchange: "XNAS",
      signal: controller.signal,
    });

    const { signal } = fetchMock.mock.calls[0][1];

    expect(signal.aborted).toBe(false);

    controller.abort();

    expect(signal.aborted).toBe(true);
  });

  describe("fetchStockQuote", () => {
    // 2026-10-12T19:45:00Z as a Unix timestamp.
    const QUOTE_TIMESTAMP = 1791834300;

    const quoteData = (overrides = {}) => ({
      symbol: "AAPL",
      close: "341.06",
      previous_close: "335.00",
      timestamp: QUOTE_TIMESTAMP,
      ...overrides,
    });

    test("fetches and normalizes a quote", async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse(quoteData()));
      vi.stubGlobal("fetch", fetchMock);

      const quote = await marketDataService.fetchStockQuote({
        symbol: "AAPL",
        exchange: "XNAS",
      });

      expect(quote).toEqual({
        priceTime: "2026-10-12T19:45:00.000Z",
        close: 341.06,
        previousClose: 335,
      });

      const parsedUrl = new URL(fetchMock.mock.calls[0][0]);

      expect(parsedUrl.pathname).toBe("/quote");
      expect(parsedUrl.searchParams.get("symbol")).toBe("AAPL");
      expect(parsedUrl.searchParams.get("exchange")).toBe("NASDAQ");
    });

    test.each([
      ["a zero previous close", { previous_close: "0" }],
      ["a negative close", { close: "-1" }],
      ["an empty close", { close: "" }],
      ["a missing previous close", { previous_close: undefined }],
      ["a non-numeric close", { close: "n/a" }],
      ["a missing timestamp", { timestamp: undefined }],
      ["a fractional timestamp", { timestamp: 1.5 }],
    ])("rejects %s", async (_, overrides) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mockResponse(quoteData(overrides))),
      );

      await expect(
        marketDataService.fetchStockQuote({ symbol: "AAPL", exchange: "XNAS" }),
      ).rejects.toThrow("Invalid Twelve Data quote response");
    });

    test("passes on Twelve Data API errors", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          mockResponse({ status: "error", message: "Symbol not found" }),
        ),
      );

      await expect(
        marketDataService.fetchStockQuote({ symbol: "NOPE", exchange: "XNAS" }),
      ).rejects.toThrow("Symbol not found");
    });
  });
});
