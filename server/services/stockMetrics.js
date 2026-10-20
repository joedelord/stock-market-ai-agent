const HttpError = require("../utils/httpError");

const DEFAULT_INTERVAL = "15min";
const UNPROCESSABLE_ENTITY = 422;
const SMA_SHORT_PERIOD = 20;
const SMA_LONG_PERIOD = 50;

const dataError = (message) => new HttpError(UNPROCESSABLE_ENTITY, message);

// pg returns NUMERIC columns as strings, and Number("") would silently be 0.
const parseClose = (value) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return NaN;
  }

  return Number(value);
};

const calculateStockMetrics = (prices, interval = DEFAULT_INTERVAL) => {
  if (!Array.isArray(prices)) {
    throw new TypeError("Prices must be an array");
  }

  // Keep intervals separate and accept either input order.
  const points = prices
    .filter((price) => price.interval_code === interval)
    .map((price) => ({
      time:
        price.price_time === null || price.price_time === undefined
          ? NaN
          : new Date(price.price_time).getTime(),
      close: parseClose(price.close),
    }))
    .sort((a, b) => a.time - b.time);

  if (
    points.some(
      (point) =>
        !Number.isFinite(point.time) ||
        !Number.isFinite(point.close) ||
        point.close <= 0,
    )
  ) {
    throw dataError("Price history contains invalid data.");
  }

  if (points.length < 2) {
    throw dataError(
      "At least two price points from the same interval are required.",
    );
  }

  if (
    points.some(
      (point, index) => index > 0 && point.time === points[index - 1].time,
    )
  ) {
    throw dataError("Price history contains duplicate timestamps.");
  }

  const first = points[0];
  const latest = points.at(-1);
  const previous = points.at(-2);

  const closes = points.map((point) => point.close);

  const averageLast = (count) => {
    if (closes.length < count) return null;

    const values = closes.slice(-count);

    return values.reduce((sum, value) => sum + value, 0) / count;
  };

  return {
    interval,
    pointCount: points.length,

    periodStart: new Date(first.time).toISOString(),
    periodEnd: new Date(latest.time).toISOString(),

    firstClose: first.close,
    latestClose: latest.close,
    previousClose: previous.close,

    latestChangePercent:
      ((latest.close - previous.close) / previous.close) * 100,

    periodChangePercent: ((latest.close - first.close) / first.close) * 100,

    // reduce instead of spreading, which can overflow the stack on long histories.
    minClose: closes.reduce((min, value) => Math.min(min, value)),
    maxClose: closes.reduce((max, value) => Math.max(max, value)),

    sma20: averageLast(SMA_SHORT_PERIOD),
    sma50: averageLast(SMA_LONG_PERIOD),
  };
};

module.exports = {
  calculateStockMetrics,
};
