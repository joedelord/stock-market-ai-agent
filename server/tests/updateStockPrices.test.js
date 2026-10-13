const pool = require("../config/db");
const stockModel = require("../models/stockModel");
const marketDataService = require("../services/marketDataService");
const { updateStockPrices } = require("../jobs/updateStockPrices");

const { clearDatabase } = require("./helpers/database");

const PRICES = [
  {
    priceTime: "2026-01-01 10:00:00",
    open: "250.10",
    high: "252.00",
    low: "249.50",
    close: "251.25",
    volume: "1200",
  },
];

beforeEach(async () => {
  await clearDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

const createStock = (symbol, exchange) =>
  stockModel.createStock({
    symbol,
    exchange,
    name: `${symbol} Corporation`,
    currency: "USD",
  });

const countPrices = async (stockId) => {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM stock_prices WHERE stock_id = $1",
    [stockId],
  );

  return result.rows[0].count;
};

describe("updateStockPrices", () => {
  test("fetches and saves prices for active stocks", async () => {
    const apple = await createStock("AAPL", "XNAS");
    const inactive = await createStock("OLD", "XNYS");

    await pool.query("UPDATE stocks SET is_active = FALSE WHERE id = $1", [
      inactive.id,
    ]);

    const fetchSpy = vi
      .spyOn(marketDataService, "fetchStockPrices")
      .mockResolvedValue({ symbol: "AAPL", interval: "15min", prices: PRICES });

    const results = await updateStockPrices({ delayMs: 0 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(fetchSpy).toHaveBeenCalledWith({
      symbol: "AAPL",
      exchange: "XNAS",
      interval: "15min",
      outputSize: 5,
    });

    expect(results).toEqual([
      { symbol: "AAPL", exchange: "XNAS", status: "success", saved: 1 },
    ]);

    expect(await countPrices(apple.id)).toBe(1);
    expect(await countPrices(inactive.id)).toBe(0);
  });

  test("continues with the next stock when one fails", async () => {
    await createStock("AAPL", "XNAS");
    const microsoft = await createStock("MSFT", "XNAS");

    vi.spyOn(marketDataService, "fetchStockPrices").mockImplementation(
      async ({ symbol }) => {
        if (symbol === "AAPL") {
          throw new Error("API limit reached");
        }

        return { symbol, interval: "15min", prices: PRICES };
      },
    );

    const results = await updateStockPrices({ delayMs: 0 });

    expect(results).toEqual([
      {
        symbol: "AAPL",
        exchange: "XNAS",
        status: "error",
        error: "API limit reached",
      },
      { symbol: "MSFT", exchange: "XNAS", status: "success", saved: 1 },
    ]);

    expect(await countPrices(microsoft.id)).toBe(1);
  });

  test("stops before the next stock when the signal is aborted", async () => {
    await createStock("AAPL", "XNAS");
    await createStock("MSFT", "XNAS");

    const controller = new AbortController();

    const fetchSpy = vi
      .spyOn(marketDataService, "fetchStockPrices")
      .mockImplementation(async ({ symbol }) => {
        controller.abort();

        return { symbol, interval: "15min", prices: PRICES };
      });

    // A long delay proves the abort also ends the wait between stocks.
    const results = await updateStockPrices({
      delayMs: 60000,
      signal: controller.signal,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(results).toEqual([
      { symbol: "AAPL", exchange: "XNAS", status: "success", saved: 1 },
    ]);
  });
});
