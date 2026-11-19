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
const RELATIVE_VOLUME_SESSIONS = 20;
const MIN_RELATIVE_VOLUME_SESSIONS = 10;
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

// Creating a formatter is slow, and thousands of bars are formatted per request.
const localFormatters = new Map();

const getLocalFormatter = (timeZone) => {
  if (!localFormatters.has(timeZone)) {
    localFormatters.set(
      timeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    );
  }

  return localFormatters.get(timeZone);
};

const localParts = (time, timeZone) => {
  const parts = Object.fromEntries(
    getLocalFormatter(timeZone)
      .formatToParts(new Date(time))
      .map(({ type, value }) => [type, value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

const localDate = (time, timeZone) => localParts(time, timeZone).date;

const positiveOrNull = (value) => {
  const number = parseDecimal(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const nonNegativeOrNull = (value) => {
  const number = parseDecimal(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const average = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

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

  const mean = average(returns);
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);

  return {
    volatilityPercent: Math.sqrt(variance),
    returnCount: returns.length,
    // Oldest first. Used to rank the day move, not stored or sent as is.
    returns,
  };
};

// Counts this move plus the earlier daily returns, newest first, that went
// the same way. A flat return ends the streak.
const countStreak = (direction, returns) => {
  if (direction === "flat") return null;

  const sign = direction === "up" ? 1 : -1;
  let streak = 1;

  for (let index = returns.length - 1; index >= 0; index -= 1) {
    if (Math.sign(returns[index]) !== sign) break;
    streak += 1;
  }

  return streak;
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
  const direction =
    close > previousClose ? "up" : close < previousClose ? "down" : "flat";
  const returns = Array.isArray(volatility?.returns) ? volatility.returns : null;
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
    direction,
    // A percentage alone does not say whether 2% is routine for this stock;
    // these compare the move with the stock's own recent daily moves.
    moveInStdDevs:
      volatility?.volatilityPercent > 0
        ? Math.abs(changePercent) / volatility.volatilityPercent
        : null,
    largerPastMoveCount: returns
      ? returns.filter((value) => Math.abs(value) >= Math.abs(changePercent)).length
      : null,
    streakSessions: returns ? countStreak(direction, returns) : null,
  };
};

const groupSessions = (prices, timeZone) => {
  const sessions = new Map();

  prices
    .map((price) => ({
      time: price.price_time == null ? NaN : new Date(price.price_time).getTime(),
      open: positiveOrNull(price.open),
      high: positiveOrNull(price.high),
      low: positiveOrNull(price.low),
      close: positiveOrNull(price.close),
      volume: nonNegativeOrNull(price.volume),
    }))
    .filter((bar) => Number.isFinite(bar.time) && bar.close !== null)
    .sort((a, b) => a.time - b.time)
    .forEach((bar) => {
      const { date, minutes } = localParts(bar.time, timeZone);
      if (!sessions.has(date)) sessions.set(date, { date, bars: [] });
      sessions.get(date).bars.push({ ...bar, minutes });
    });

  return [...sessions.values()];
};

const mostCommon = (values) => {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  return [...counts.entries()].reduce(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    [undefined, 0],
  )[0];
};

// Null when a bar in the window lacks volume, since a partial sum would read
// as unusually quiet trading.
const volumeUntil = (session, cutoffMinutes) => {
  const bars = session.bars.filter((bar) => bar.minutes <= cutoffMinutes);
  if (bars.some((bar) => bar.volume === null)) return null;

  return bars.reduce((sum, bar) => sum + bar.volume, 0);
};

// Describes the latest stored session from its bars. Volume is compared with
// earlier sessions up to the same time of day, because a session in progress
// has naturally traded less than a full one.
const calculateSessionActivity = (prices, exchange) => {
  if (!Array.isArray(prices)) {
    throw new TypeError("Prices must be an array");
  }

  const timeZone = EXCHANGE_TIME_ZONES[exchange] ?? "UTC";
  const sessions = groupSessions(prices, timeZone);

  if (sessions.length === 0) return null;

  const current = sessions.at(-1);
  const earlier = sessions.slice(0, -1);
  const lastBar = current.bars.at(-1);
  const cutoffMinutes = lastBar.minutes;

  // Price updates can start mid-session. A session whose first stored bar is
  // later than usual is missing its open, so its gap, range and volume would
  // be wrong.
  const openMinutes = mostCommon(earlier.map((session) => session.bars[0].minutes));
  const startsAtOpen = (session) =>
    openMinutes !== undefined && session.bars[0].minutes === openMinutes;
  const startsAtSessionOpen = startsAtOpen(current);

  const summary = {
    sessionDate: current.date,
    lastBarTime: new Date(lastBar.time).toISOString(),
    barCount: current.bars.length,
    startsAtSessionOpen,
    gapPercent: null,
    sessionHigh: null,
    sessionLow: null,
    volume: null,
    averageVolume: null,
    relativeVolume: null,
    volumeBaselineSessions: 0,
  };

  if (!startsAtSessionOpen) return summary;

  const open = current.bars[0].open;
  const previousClose = earlier.at(-1).bars.at(-1).close;
  const highs = current.bars.map((bar) => bar.high).filter((value) => value !== null);
  const lows = current.bars.map((bar) => bar.low).filter((value) => value !== null);

  // Earlier sessions count only if they cover the same part of the day, so
  // half days and late starts do not lower the baseline.
  const baseline = earlier
    .filter((session) => startsAtOpen(session) && session.bars.at(-1).minutes >= cutoffMinutes)
    .slice(-RELATIVE_VOLUME_SESSIONS)
    .map((session) => volumeUntil(session, cutoffMinutes))
    .filter((value) => value !== null && value > 0);

  // Zero volume for a whole session so far means the provider sent none.
  const volume = volumeUntil(current, cutoffMinutes) || null;
  const hasBaseline = volume !== null && baseline.length >= MIN_RELATIVE_VOLUME_SESSIONS;
  const averageVolume = hasBaseline ? average(baseline) : null;

  return {
    ...summary,
    gapPercent: open === null ? null : ((open - previousClose) / previousClose) * 100,
    sessionHigh: highs.length > 0 ? highs.reduce((max, value) => Math.max(max, value)) : null,
    sessionLow: lows.length > 0 ? lows.reduce((min, value) => Math.min(min, value)) : null,
    volume,
    averageVolume,
    relativeVolume: hasBaseline ? volume / averageVolume : null,
    volumeBaselineSessions: hasBaseline ? baseline.length : 0,
  };
};

module.exports = {
  calculateStockMetrics,
  calculateDailyVolatility,
  calculateDayMovement,
  calculateSessionActivity,
};
