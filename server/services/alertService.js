const alertModel = require("../models/alertModel");
const stockModel = require("../models/stockModel");
const { getExchangeTimeZone } = require("../config/exchangeMapping");
const { parseDecimal } = require("../utils/parseDecimal");

const PRICE_INTERVAL = "15min";

// en-CA formats dates as YYYY-MM-DD, the format of a DATE column.
const toMarketDate = (time, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(time));

const formatPrice = (value, currency) =>
  `${parseDecimal(value).toFixed(2)} ${currency}`;

const formatPercent = (value) => {
  const number = parseDecimal(value);

  return `${number > 0 ? "+" : ""}${number.toFixed(2)} %`;
};

const buildAlertMessage = (stock, alert, price) => {
  const name = `${stock.symbol} (${stock.exchange})`;
  // Number() drops the trailing zeros of NUMERIC(18,6), e.g. "100.000000".
  const threshold = Number(alert.threshold);

  switch (alert.alert_type) {
    case "price_above":
      return `${name} is at ${formatPrice(price, stock.currency)}, at or above your alert of ${threshold} ${stock.currency}.`;
    case "price_below":
      return `${name} is at ${formatPrice(price, stock.currency)}, at or below your alert of ${threshold} ${stock.currency}.`;
    case "daily_change_above":
      return `${name} has changed ${formatPercent(alert.daily_change)} today, at or above your alert of ${formatPercent(threshold)}.`;
    case "daily_change_below":
      return `${name} has changed ${formatPercent(alert.daily_change)} today, at or below your alert of ${formatPercent(threshold)}.`;
    default:
      throw new Error(`Unknown alert type: ${alert.alert_type}`);
  }
};

// Prices update every 15 minutes but quotes only hourly, so the newer of the
// latest bar and the quote is checked. The quote's previous close is only a
// valid base for the daily change on the quote's own market day.
const getLatestPrice = async (stock) => {
  const [latestBar] = await stockModel.getStockPrices(
    stock.id,
    1,
    PRICE_INTERVAL,
  );
  const quote = await stockModel.getStockQuote(stock.id);

  const candidates = [
    latestBar && { price: latestBar.close, priceTime: latestBar.price_time },
    quote && { price: quote.close, priceTime: quote.price_time },
  ].filter(Boolean);

  if (candidates.length === 0) return undefined;

  const latest = candidates.reduce((newest, candidate) =>
    new Date(candidate.priceTime) > new Date(newest.priceTime)
      ? candidate
      : newest,
  );

  const timeZone = getExchangeTimeZone(stock.exchange);
  const marketDate = toMarketDate(latest.priceTime, timeZone);

  const previousClose =
    quote && toMarketDate(quote.price_time, timeZone) === marketDate
      ? quote.previous_close
      : null;

  return { ...latest, previousClose, marketDate };
};

// Returns the notifications created for this stock's alerts.
const checkStockAlerts = async (stock) => {
  const latest = await getLatestPrice(stock);

  if (!latest) return [];

  return alertModel.triggerAlerts(stock.id, latest, (alert) =>
    buildAlertMessage(stock, alert, latest.price),
  );
};

module.exports = {
  buildAlertMessage,
  checkStockAlerts,
};
