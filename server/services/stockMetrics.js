const HttpError = require("../utils/httpError");
const { parseDecimal } = require("../utils/parseDecimal");

const DEFAULT_INTERVAL = "15min";
const UNPROCESSABLE_ENTITY = 422;
const SMA_SHORT_PERIOD = 20;
const SMA_LONG_PERIOD = 50;
// Used when there is too little history to estimate volatility.
const FALLBACK_SIGNIFICANT_PERCENT = 3;
const VOLATILITY_MULTIPLIER = 2;
// Keeps very calm stocks from flagging ordinary sub-percent moves.
const MIN_SIGNIFICANT_PERCENT = 1;
const MIN_VOLATILITY_RETURNS = 10;
const MAX_VOLATILITY_RETURNS = 60;
const EXCHANGE_TIME_ZONES = {
  XHEL: "Europe/Helsinki",
  XNAS: "America/New_York",
  XNYS: "America/New_York",
};

const dataError = (message) => new HttpError(UNPROCESSABLE_ENTITY, message);

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
      close: parseDecimal(price.close),
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

const localDate = (time, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(time));

// Only intraday bars are stored, so the last bar of each exchange-local date
// approximates that day's close. Days before the quote's date are used, so
// the move being judged does not inflate its own baseline. Gaps in the
// stored history make some returns span more than one session.
const calculateDailyVolatility = (prices, exchange, quoteTime) => {
  const timeZone = EXCHANGE_TIME_ZONES[exchange] ?? "UTC";
  const quoteDate = localDate(quoteTime, timeZone);
  const closesByDate = new Map();

  const points = prices
    .map((price) => ({
      time: price.price_time == null ? NaN : new Date(price.price_time).getTime(),
      close: parseDecimal(price.close),
    }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.time - b.time);

  points.forEach((point) => {
    const date = localDate(point.time, timeZone);
    if (date < quoteDate) closesByDate.set(date, point.close);
  });

  const closes = [...closesByDate.values()];
  const returns = closes
    .slice(1)
    .map((close, index) => ((close - closes[index]) / closes[index]) * 100)
    .slice(-MAX_VOLATILITY_RETURNS);

  if (returns.length < MIN_VOLATILITY_RETURNS) return null;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);

  return {
    volatilityPercent: Math.sqrt(variance),
    returnCount: returns.length,
  };
};

// Quote time is independent of the bar-history period. Do not substitute a
// bar-to-bar change when a quote is unavailable or invalid.
const calculateDayMovement = (quote, volatility = null) => {
  if (!quote) return null;

  const close = parseDecimal(quote.close);
  const previousClose = parseDecimal(quote.previous_close);
  const time =
    quote.price_time == null ? NaN : new Date(quote.price_time).getTime();

  if (
    !Number.isFinite(close) ||
    close <= 0 ||
    !Number.isFinite(previousClose) ||
    previousClose <= 0 ||
    !Number.isFinite(time)
  ) {
    return null;
  }

  const changePercent = ((close - previousClose) / previousClose) * 100;
  const thresholdPercent = volatility
    ? Math.max(volatility.volatilityPercent * VOLATILITY_MULTIPLIER, MIN_SIGNIFICANT_PERCENT)
    : FALLBACK_SIGNIFICANT_PERCENT;

  return {
    priceTime: new Date(time).toISOString(),
    close,
    previousClose,
    change: close - previousClose,
    changePercent,
    thresholdPercent,
    thresholdMethod: volatility ? "volatility" : "fixed",
    volatilityPercent: volatility?.volatilityPercent ?? null,
    volatilityReturnCount: volatility?.returnCount ?? 0,
    isSignificant: Math.abs(changePercent) >= thresholdPercent,
    direction: close > previousClose ? "up" : close < previousClose ? "down" : "flat",
  };
};

module.exports = {
  calculateStockMetrics,
  calculateDailyVolatility,
  calculateDayMovement,
};
