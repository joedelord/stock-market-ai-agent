const cron = require("node-cron");

const logger = require("../utils/logger");
const { updateStockPrices } = require("./updateStockPrices");
const { MARKET_CALENDAR } = require("../config/marketCalendar");

// Every 15 minutes on weekdays (UTC); market-specific local hours are below.
const CRON_EXPRESSION = "*/15 * * * 1-5";

// The close is the actual market close; a final-candle buffer is added below.
const MARKET_HOURS = [
  {
    exchanges: ["XNAS", "XNYS"],
    timeZone: "America/New_York",
    open: "09:30",
    close: "16:00",
  },
  {
    exchanges: ["XHEL"],
    timeZone: "Europe/Helsinki",
    open: "10:00",
    close: "18:30",
  },
];

const WEEKEND = ["Sat", "Sun"];

const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// The final candle is fetched on the cron tick 15 minutes after close.
const FINAL_CANDLE_BUFFER = 15;
const warnedMissingCalendars = new Set();

// Returns { closed, close } for the exchange-local date, or null when the
// year has no calendar so the caller falls back to normal hours.
const getCalendarDay = (exchange, year, localDate) => {
  const calendar = MARKET_CALENDAR[exchange]?.[year];

  if (!calendar) {
    const key = `${exchange}:${year}`;
    if (!warnedMissingCalendars.has(key)) {
      warnedMissingCalendars.add(key);
      logger.warn({ exchange, year }, "Market calendar missing; using normal hours");
    }
    return null;
  }

  return {
    closed: calendar.closed.includes(localDate),
    close: calendar.earlyClose[localDate],
  };
};

const isOpenAt = ({ timeZone, open, close }, exchange, date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  if (WEEKEND.includes(getPart("weekday"))) return false;

  const year = getPart("year");
  const localDate = `${year}-${getPart("month")}-${getPart("day")}`;
  const calendarDay = getCalendarDay(exchange, year, localDate);

  if (calendarDay?.closed) return false;

  const actualClose = calendarDay?.close ?? close;
  const currentMinutes = toMinutes(`${getPart("hour")}:${getPart("minute")}`);
  return currentMinutes >= toMinutes(open)
    && currentMinutes <= toMinutes(actualClose) + FINAL_CANDLE_BUFFER;
};

const getOpenExchanges = (date = new Date(), markets = MARKET_HOURS) =>
  [...new Set(markets.flatMap((market) =>
    (market.exchanges || []).filter((exchange) => isOpenAt(market, exchange, date)),
  ))];

const isMarketOpen = (date = new Date(), markets = MARKET_HOURS) =>
  getOpenExchanges(date, markets).length > 0;

const createMarketScheduler = ({
  updatePrices = updateStockPrices,
  getExchanges = getOpenExchanges,
} = {}) => {
  const stopController = new AbortController();
  let currentRun = null;

  const updateAndLog = async (exchanges) => {
    try {
      const results = await updatePrices({
        signal: stopController.signal,
        exchanges,
      });
      const failed = results.filter((result) => result.status === "error");

      for (const { symbol, exchange, error } of failed) {
        logger.warn({ symbol, exchange, error }, "Price update failed");
      }

      for (const { symbol, exchange, alertError } of results) {
        if (alertError) {
          logger.warn(
            { symbol, exchange, error: alertError },
            "Alert check failed",
          );
        }
      }

      const alertsTriggered = results.reduce(
        (total, result) => total + (result.alertsTriggered ?? 0),
        0,
      );

      logger.info(
        {
          exchanges,
          updated: results.length - failed.length,
          failed: failed.length,
          alertsTriggered,
        },
        "Stock prices updated",
      );
    } catch (error) {
      logger.error({ err: error }, "Price update run failed");
    }
  };

  const run = () => {
    if (stopController.signal.aborted) return null;

    if (currentRun) {
      logger.warn("Previous price update still running, skipping");
      return null;
    }

    const exchanges = getExchanges();
    if (exchanges.length === 0) {
      logger.debug("All markets are closed, skipping");
      return null;
    }

    currentRun = updateAndLog(exchanges).finally(() => {
      currentRun = null;
    });
    return currentRun;
  };

  const task = cron.createTask(CRON_EXPRESSION, run, { timezone: "UTC" });

  const start = async () => {
    task.start();
    logger.info({ schedule: CRON_EXPRESSION }, "Market scheduler started");
    await run();
  };

  const stop = async () => {
    task.stop();
    stopController.abort();
    await currentRun;
    logger.info("Market scheduler stopped");
  };

  return { start, stop, run };
};

module.exports = {
  MARKET_HOURS,
  isMarketOpen,
  getOpenExchanges,
  createMarketScheduler,
};
