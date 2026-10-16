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

describe("Update Stock Prices Job", () => {
  beforeEach(() => {
    vi.spyOn(stockModel, "getAllStocks").mockResolvedValue(stocks);

    vi.spyOn(marketDataService, "fetchStockPrices").mockResolvedValue(
      sampleData,
    );

    vi.spyOn(stockModel, "saveStockPrices").mockResolvedValue(1);
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
      },
    ]);

    expect(marketDataService.fetchStockPrices).toHaveBeenCalledTimes(1);
    expect(stockModel.saveStockPrices).toHaveBeenCalledTimes(1);
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
});
