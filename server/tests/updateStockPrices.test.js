const stockModel = require("../models/stockModel");
const marketDataService = require("../services/marketDataService");

const { updateStockPrices } = require("../jobs/updateStockPrices");

const stocks = [
  {
    id: 1,
    symbol: "AAPL",
    exchange: "XNAS",
    is_active: true,
  },
  {
    id: 2,
    symbol: "NOKIA",
    exchange: "XHEL",
    is_active: true,
  },
  {
    id: 3,
    symbol: "MSFT",
    exchange: "XNAS",
    is_active: false,
  },
];

const sampleData = {
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
};

const sampleQuote = {
  priceTime: "2026-10-12T19:45:00.000Z",
  close: 341.06,
  previousClose: 335,
};

const ONE_MINUTE_MS = 60 * 1000;

const storedQuote = (ageMs) => ({
  stock_id: 1,
  fetched_at: new Date(Date.now() - ageMs),
});

describe("Update Stock Prices Job", () => {
  beforeEach(() => {
    vi.spyOn(stockModel, "getAllStocks").mockResolvedValue(stocks);

    vi.spyOn(marketDataService, "fetchStockPrices").mockResolvedValue(
      sampleData,
    );

    vi.spyOn(stockModel, "saveStockPrices").mockResolvedValue(1);

    vi.spyOn(marketDataService, "fetchStockQuote").mockResolvedValue(
      sampleQuote,
    );

    vi.spyOn(stockModel, "getStockQuote").mockResolvedValue(undefined);

    vi.spyOn(stockModel, "saveStockQuote").mockResolvedValue({
      stock_id: 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("updates all active stocks", async () => {
    const results = await updateStockPrices({ delayMs: 0 });

    expect(results).toHaveLength(2);

    expect(marketDataService.fetchStockPrices).toHaveBeenCalledTimes(2);

    expect(stockModel.saveStockPrices).toHaveBeenCalledTimes(2);

    expect(results.every((r) => r.status === "success")).toBe(true);

    expect(marketDataService.fetchStockQuote).toHaveBeenCalledTimes(2);
    expect(stockModel.saveStockQuote).toHaveBeenCalledTimes(2);
    expect(results.every((result) => result.quoteSaved)).toBe(true);
  });

  test("updates only stocks from selected exchanges", async () => {
    const results = await updateStockPrices({
      delayMs: 0,
      exchanges: ["XHEL"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("NOKIA");
    expect(marketDataService.fetchStockPrices).toHaveBeenCalledTimes(1);
    expect(stockModel.saveStockPrices).toHaveBeenCalledWith(
      2,
      "15min",
      sampleData.prices,
    );
  });

  test("empty exchange list does not fetch prices", async () => {
    const results = await updateStockPrices({ delayMs: 0, exchanges: [] });
    expect(results).toEqual([]);
    expect(marketDataService.fetchStockPrices).not.toHaveBeenCalled();
  });

  test("skips inactive stocks", async () => {
    await updateStockPrices({ delayMs: 0 });

    const calls = marketDataService.fetchStockPrices.mock.calls;

    const symbols = calls.map(([args]) => args.symbol);

    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("NOKIA");
    expect(symbols).not.toContain("MSFT");
  });

  test("passes correct options to the market data service", async () => {
    const controller = new AbortController();

    await updateStockPrices({ delayMs: 0, signal: controller.signal });

    expect(marketDataService.fetchStockPrices).toHaveBeenNthCalledWith(1, {
      symbol: "AAPL",
      exchange: "XNAS",
      interval: "15min",
      outputSize: 5,
      signal: controller.signal,
    });

    expect(marketDataService.fetchStockPrices).toHaveBeenNthCalledWith(2, {
      symbol: "NOKIA",
      exchange: "XHEL",
      interval: "15min",
      outputSize: 5,
      signal: controller.signal,
    });
  });

  test("passes correct data to database", async () => {
    await updateStockPrices({ delayMs: 0 });

    expect(stockModel.saveStockPrices).toHaveBeenCalledWith(
      1,
      "15min",
      sampleData.prices,
    );
  });

  test("continues after API failure", async () => {
    marketDataService.fetchStockPrices
      .mockRejectedValueOnce(new Error("API unavailable"))
      .mockResolvedValueOnce(sampleData);

    const results = await updateStockPrices({ delayMs: 0 });

    expect(results[0]).toMatchObject({
      symbol: "AAPL",
      status: "error",
      error: "API unavailable",
    });

    expect(results[1]).toMatchObject({
      symbol: "NOKIA",
      status: "success",
    });

    expect(stockModel.saveStockPrices).toHaveBeenCalledTimes(1);
    expect(marketDataService.fetchStockQuote).toHaveBeenCalledTimes(2);
    expect(stockModel.saveStockQuote).toHaveBeenCalledTimes(2);
  });

  test("handles database errors", async () => {
    stockModel.saveStockPrices
      .mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValueOnce(1);

    const results = await updateStockPrices({ delayMs: 0 });

    expect(results[0]).toMatchObject({
      status: "error",
      error: "Database unavailable",
    });

    expect(results[1].status).toBe("success");
  });

  test("returns empty array when no stocks exist", async () => {
    stockModel.getAllStocks.mockResolvedValue([]);

    const results = await updateStockPrices({ delayMs: 0 });

    expect(results).toEqual([]);

    expect(marketDataService.fetchStockPrices).not.toHaveBeenCalled();
  });

  test("does not fetch stocks if already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const results = await updateStockPrices({
      delayMs: 0,
      signal: controller.signal,
    });

    expect(results).toEqual([]);
    expect(stockModel.getAllStocks).not.toHaveBeenCalled();
  });

  test("stops before the next stock after abort", async () => {
    const controller = new AbortController();

    marketDataService.fetchStockPrices.mockImplementation(async () => {
      controller.abort();
      return sampleData;
    });

    const results = await updateStockPrices({
      delayMs: 0,
      signal: controller.signal,
    });

    expect(results).toEqual([
      {
        symbol: "AAPL",
        exchange: "XNAS",
        status: "success",
        saved: 1,
        quoteSaved: false,
      },
    ]);

    expect(marketDataService.fetchStockPrices).toHaveBeenCalledTimes(1);
    expect(stockModel.saveStockPrices).toHaveBeenCalledTimes(1);
    expect(marketDataService.fetchStockQuote).not.toHaveBeenCalled();
  });

  test("abort during the delay ends the run without waiting", async () => {
    const controller = new AbortController();

    stockModel.saveStockPrices.mockImplementation(async () => {
      setTimeout(() => controller.abort(), 10);
      return 1;
    });

    const startedAt = Date.now();

    const results = await updateStockPrices({
      delayMs: 60000,
      signal: controller.signal,
    });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("AAPL");
    expect(marketDataService.fetchStockPrices).toHaveBeenCalledTimes(1);
  });

  test("fetches and saves the quote for the selected stock", async () => {
    const controller = new AbortController();

    await updateStockPrices({
      delayMs: 0,
      exchanges: ["XNAS"],
      signal: controller.signal,
    });

    expect(marketDataService.fetchStockQuote).toHaveBeenCalledOnce();

    expect(marketDataService.fetchStockQuote).toHaveBeenCalledWith({
      symbol: "AAPL",
      exchange: "XNAS",
      signal: controller.signal,
    });

    expect(stockModel.saveStockQuote).toHaveBeenCalledWith(1, sampleQuote);
  });

  test("preserves price history and continues when a quote request fails", async () => {
    marketDataService.fetchStockQuote.mockRejectedValueOnce(
      new Error("Quote API unavailable"),
    );

    const results = await updateStockPrices({ delayMs: 0 });

    expect(results[0]).toMatchObject({
      symbol: "AAPL",
      status: "success",
      saved: 1,
      quoteSaved: false,
      quoteError: "Quote API unavailable",
    });

    expect(results[1]).toMatchObject({
      symbol: "NOKIA",
      status: "success",
      saved: 1,
      quoteSaved: true,
    });

    expect(stockModel.saveStockPrices).toHaveBeenCalledTimes(2);
    expect(stockModel.saveStockQuote).toHaveBeenCalledTimes(1);

    expect(stockModel.saveStockQuote).toHaveBeenCalledWith(2, sampleQuote);
  });

  test("preserves price history when saving a quote fails", async () => {
    stockModel.saveStockQuote.mockRejectedValueOnce(
      new Error("Quote database error"),
    );

    const results = await updateStockPrices({ delayMs: 0 });

    expect(results[0]).toMatchObject({
      status: "success",
      saved: 1,
      quoteSaved: false,
      quoteError: "Quote database error",
    });

    expect(results[1].quoteSaved).toBe(true);
    expect(stockModel.saveStockPrices).toHaveBeenCalledTimes(2);
  });

  test("reports when an older quote was not saved", async () => {
    stockModel.saveStockQuote.mockResolvedValueOnce(undefined);

    const results = await updateStockPrices({
      delayMs: 0,
      exchanges: ["XNAS"],
    });

    expect(results[0]).toEqual({
      symbol: "AAPL",
      exchange: "XNAS",
      status: "success",
      saved: 1,
      quoteSaved: false,
    });
  });

  test("reuses a quote fetched within the last hour", async () => {
    stockModel.getStockQuote.mockResolvedValue(storedQuote(10 * ONE_MINUTE_MS));

    const results = await updateStockPrices({ delayMs: 0 });

    expect(marketDataService.fetchStockQuote).not.toHaveBeenCalled();
    expect(stockModel.saveStockQuote).not.toHaveBeenCalled();

    expect(results[0]).toMatchObject({
      status: "success",
      saved: 1,
      quoteSaved: false,
      quoteSkipped: true,
    });
  });

  test("fetches a new quote when the stored one is over an hour old", async () => {
    stockModel.getStockQuote.mockResolvedValue(storedQuote(61 * ONE_MINUTE_MS));

    const results = await updateStockPrices({
      delayMs: 0,
      exchanges: ["XNAS"],
    });

    expect(marketDataService.fetchStockQuote).toHaveBeenCalledOnce();
    expect(results[0].quoteSaved).toBe(true);
    expect(results[0].quoteSkipped).toBeUndefined();
  });

  test("reports a quote lookup failure without losing price history", async () => {
    stockModel.getStockQuote.mockRejectedValueOnce(new Error("Lookup failed"));

    const results = await updateStockPrices({
      delayMs: 0,
      exchanges: ["XNAS"],
    });

    expect(results[0]).toMatchObject({
      status: "success",
      saved: 1,
      quoteSaved: false,
      quoteError: "Lookup failed",
    });

    expect(marketDataService.fetchStockQuote).not.toHaveBeenCalled();
  });
});
