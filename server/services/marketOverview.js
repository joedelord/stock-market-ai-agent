const {
  SUPPORTED_EXCHANGES,
  getExchangeTimeZone,
} = require("../config/exchangeMapping");

const MARKET_EXCHANGES = {
  all: SUPPORTED_EXCHANGES,
  us: ["XNAS", "XNYS"],
  helsinki: ["XHEL"],
};

const LIST_SIZE = 5;
// The overview is public. With a single follower, the count would show what
// one user watches.
const MIN_FOLLOWERS = 2;

// en-CA formats dates as YYYY-MM-DD, which sorts as text.
const toMarketDate = (stock) => {
  const time = new Date(stock.price_time);

  if (!stock.price_time || !Number.isFinite(time.getTime())) return null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getExchangeTimeZone(stock.exchange),
  }).format(time);
};

const hasDayChange = (stock) =>
  stock.day_change_percent !== null &&
  stock.day_change_percent !== undefined &&
  Number.isFinite(Number(stock.day_change_percent));

const tieBreak = (a, b) =>
  a.symbol.localeCompare(b.symbol) ||
  a.exchange.localeCompare(b.exchange) ||
  Number(a.id) - Number(b.id);

const getMarketExchanges = (market) => MARKET_EXCHANGES[market];

// A quote from an older trading day cannot enter the ranking for its
// exchange. On weekends the latest stored trading day remains available;
// every result keeps its real quote time, never a fake live time.
const buildOverview = (stocks, market = "all") => {
  const exchanges = getMarketExchanges(market);
  const visible = stocks.filter((stock) => exchanges.includes(stock.exchange));

  const latestDates = new Map();

  for (const stock of visible) {
    const date = toMarketDate(stock);

    if (date && date > (latestDates.get(stock.exchange) ?? "")) {
      latestDates.set(stock.exchange, date);
    }
  }

  const ranked = visible.filter((stock) => {
    const date = toMarketDate(stock);

    return (
      date && date === latestDates.get(stock.exchange) && hasDayChange(stock)
    );
  });

  const change = (stock) => Number(stock.day_change_percent);

  return {
    gainers: ranked
      .filter((stock) => change(stock) > 0)
      .sort((a, b) => change(b) - change(a) || tieBreak(a, b))
      .slice(0, LIST_SIZE),

    losers: ranked
      .filter((stock) => change(stock) < 0)
      .sort((a, b) => change(a) - change(b) || tieBreak(a, b))
      .slice(0, LIST_SIZE),

    mostFollowed: visible
      .filter((stock) => Number(stock.follower_count) >= MIN_FOLLOWERS)
      .sort(
        (a, b) =>
          Number(b.follower_count) - Number(a.follower_count) || tieBreak(a, b),
      )
      .slice(0, LIST_SIZE),

    generatedAt: new Date().toISOString(),
  };
};

module.exports = {
  getMarketExchanges,
  buildOverview,
};
