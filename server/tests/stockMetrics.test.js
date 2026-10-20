const { calculateStockMetrics } = require("../services/stockMetrics");

const START_TIME = Date.parse("2026-01-05T14:30:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const makePrice = (index, close, interval = "15min") => ({
  interval_code: interval,
  price_time: new Date(START_TIME + index * FIFTEEN_MINUTES_MS),
  close: String(close),
});

const makePrices = (closes) =>
  closes.map((close, index) => makePrice(index, close));

describe("Stock Metrics", () => {
  test("calculates metrics from unsorted prices", () => {
    const prices = makePrices([100, 110, 99]).reverse();

    const metrics = calculateStockMetrics(prices);

    expect(metrics).toMatchObject({
      interval: "15min",
      pointCount: 3,
      periodStart: "2026-01-05T14:30:00.000Z",
      periodEnd: "2026-01-05T15:00:00.000Z",
      firstClose: 100,
      latestClose: 99,
      previousClose: 110,
      minClose: 99,
      maxClose: 110,
      sma20: null,
      sma50: null,
    });

    expect(metrics.latestChangePercent).toBeCloseTo(-10);
    expect(metrics.periodChangePercent).toBeCloseTo(-1);
  });

  test("ignores prices from other intervals", () => {
    const prices = [...makePrices([100, 102]), makePrice(5, 500, "1day")];

    const metrics = calculateStockMetrics(prices);

    expect(metrics.pointCount).toBe(2);
    expect(metrics.maxClose).toBe(102);
  });

  test("uses the requested interval", () => {
    const prices = [makePrice(0, 50, "1day"), makePrice(1, 55, "1day")];

    const metrics = calculateStockMetrics(prices, "1day");

    expect(metrics).toMatchObject({
      interval: "1day",
      pointCount: 2,
      latestClose: 55,
    });
  });

  test("returns sma20 once there are 20 points", () => {
    const closes = Array.from({ length: 20 }, (_, index) => index + 1);

    const metrics = calculateStockMetrics(makePrices(closes));

    expect(metrics.sma20).toBeCloseTo(10.5);
    expect(metrics.sma50).toBeNull();
  });

  test("averages only the latest points for sma20 and sma50", () => {
    const closes = Array.from({ length: 60 }, (_, index) => index + 1);

    const metrics = calculateStockMetrics(makePrices(closes));

    expect(metrics.sma20).toBeCloseTo(50.5);
    expect(metrics.sma50).toBeCloseTo(35.5);
  });

  test("rejects input that is not an array", () => {
    expect(() => calculateStockMetrics(null)).toThrow(TypeError);
  });

  test("rejects fewer than two points", () => {
    expect(() => calculateStockMetrics(makePrices([100]))).toThrow(
      expect.objectContaining({
        status: 422,
        expose: true,
        message:
          "At least two price points from the same interval are required.",
      }),
    );
  });

  test.each([
    ["an empty close", ""],
    ["a zero close", "0"],
    ["a negative close", "-5"],
    ["a non-numeric close", "abc"],
    ["a null close", null],
  ])("rejects %s", (_, close) => {
    const prices = [makePrice(0, 100), { ...makePrice(1, 0), close }];

    expect(() => calculateStockMetrics(prices)).toThrow(
      "Price history contains invalid data.",
    );
  });

  test("rejects a missing timestamp", () => {
    const prices = [
      makePrice(0, 100),
      { ...makePrice(1, 101), price_time: null },
    ];

    expect(() => calculateStockMetrics(prices)).toThrow(
      "Price history contains invalid data.",
    );
  });

  test("rejects duplicate timestamps", () => {
    const prices = [makePrice(0, 100), makePrice(0, 101), makePrice(1, 102)];

    expect(() => calculateStockMetrics(prices)).toThrow(
      "Price history contains duplicate timestamps.",
    );
  });
});
