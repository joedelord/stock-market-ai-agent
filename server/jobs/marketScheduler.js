const cron = require("node-cron");

const logger = require("../utils/logger");
const { updateStockPrices } = require("./updateStockPrices");

// Every 15 minutes on weekdays (UTC); market-specific local hours are below.
const CRON_EXPRESSION = "*/15 * * * 1-5";

// The close includes a 15-minute buffer to collect the final candle.
// Exchange holidays and early closes are not covered yet.
const MARKET_HOURS = [
  {
    exchanges: ["XNAS", "XNYS"],
    timeZone: "America/New_York",
    open: "09:30",
    close: "16:15",
  },
  {
    exchanges: ["XHEL"],
    timeZone: "Europe/Helsinki",
    open: "10:00",
    close: "18:45",
  },
];

const WEEKEND = ["Sat", "Sun"];

const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const isOpenAt = ({ timeZone, open, close }, date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  if (WEEKEND.includes(getPart("weekday"))) return false;

  const currentMinutes = toMinutes(`${getPart("hour")}:${getPart("minute")}`);
  return currentMinutes >= toMinutes(open) && currentMinutes < toMinutes(close);
};

const getOpenExchanges = (date = new Date(), markets = MARKET_HOURS) =>
  [...new Set(
    markets
      .filter((market) => isOpenAt(market, date))
      .flatMap((market) => market.exchanges || []),
  )];

const isMarketOpen = (date = new Date(), markets = MARKET_HOURS) =>
  markets.some((market) => isOpenAt(market, date));

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

      logger.info(
        {
          exchanges,
          updated: results.length - failed.length,
          failed: failed.length,
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
