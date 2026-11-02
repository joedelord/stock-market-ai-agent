const {
  calculateStockMetrics,
  calculateDailyVolatility,
  calculateDayMovement,
} = require("../services/stockMetrics");

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


describe("Day movement", () => {
  const quote = (close) => ({
    close: String(close), previous_close: "100",
    price_time: "2026-10-19T14:00:00.000Z",
  });

  test.each([
    [103, 3, true, "up"], [97, -3, true, "down"],
    [102.99, 2.99, false, "up"], [97.01, -2.99, false, "down"],
    [100, 0, false, "flat"],
  ])("classifies a quote of %s against previous session close", (close, percent, significant, direction) => {
    const result = calculateDayMovement(quote(close));
    expect(result.changePercent).toBeCloseTo(percent);
    expect(result).toMatchObject({
      close, previousClose: 100, thresholdPercent: 3,
      isSignificant: significant, direction,
      priceTime: "2026-10-19T14:00:00.000Z",
    });
  });

  test.each([
    undefined, null, {},
    { ...quote(103), close: null },
    { ...quote(103), close: "Infinity" },
    { ...quote(103), previous_close: "0" },
    { ...quote(103), previous_close: "-1" },
    { ...quote(103), price_time: null },
    { ...quote(103), price_time: "invalid" },
  ])("returns unavailable for missing or invalid quotes: %j", (value) => {
    expect(calculateDayMovement(value)).toBeNull();
  });
});

describe("Daily volatility", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const QUOTE_TIME = "2026-10-20T19:00:00.000Z";
  // Two 15-minute bars per New York session; only the later one is the close.
  const sessions = (closes) =>
    closes.flatMap((close, index) => {
      const time = Date.parse("2026-09-01T19:45:00.000Z") + index * DAY_MS;
      return [
        { price_time: new Date(time - 15 * 60 * 1000).toISOString(), close: "1" },
        { price_time: new Date(time).toISOString(), close: String(close) },
      ];
    });
  const alternating = (count) =>
    Array.from({ length: count }, (_, index) => (index % 2 ? 101 : 100));

  test("uses the last bar of each local date before the quote", () => {
    const result = calculateDailyVolatility(sessions(alternating(11)), "XNAS", QUOTE_TIME);
    expect(result.returnCount).toBe(10);
    expect(result.volatilityPercent).toBeGreaterThan(0.9);
    expect(result.volatilityPercent).toBeLessThan(1.1);
  });

  test("ignores bars on the quote's own date", () => {
    const prices = [
      ...sessions(alternating(11)),
      { price_time: "2026-10-20T15:00:00.000Z", close: "500" },
    ];
    expect(calculateDailyVolatility(prices, "XNAS", QUOTE_TIME).returnCount).toBe(10);
  });

  test("returns null with too little history", () => {
    expect(calculateDailyVolatility(sessions(alternating(10)), "XNAS", QUOTE_TIME)).toBeNull();
  });

  test("sets the threshold to twice the volatility, with a floor", () => {
    const quote = { close: "101.5", previous_close: "100", price_time: QUOTE_TIME };
    expect(calculateDayMovement(quote, { volatilityPercent: 0.6, returnCount: 25 })).toMatchObject({
      thresholdPercent: 1.2, thresholdMethod: "volatility",
      volatilityPercent: 0.6, volatilityReturnCount: 25, isSignificant: true,
    });
    expect(calculateDayMovement(quote, { volatilityPercent: 0.2, returnCount: 25 })).toMatchObject({
      thresholdPercent: 1, isSignificant: true,
    });
    expect(calculateDayMovement(quote, { volatilityPercent: 2, returnCount: 25 })).toMatchObject({
      thresholdPercent: 4, isSignificant: false,
    });
    expect(calculateDayMovement(quote)).toMatchObject({
      thresholdPercent: 3, thresholdMethod: "fixed", volatilityPercent: null, isSignificant: false,
    });
  });
});
