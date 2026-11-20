const cron = require("node-cron");

const logger = require("../utils/logger");
const errorTracking = require("../utils/errorTracking");
const alertService = require("../services/alertService");
const dailyDigestService = require("../services/dailyDigestService");
const groqService = require("../services/groqService");
const heartbeatService = require("../services/heartbeatService");
const { updateStockPrices } = require("./updateStockPrices");
const { cleanupOldData } = require("./cleanupData");
const { MARKET_CALENDAR } = require("../config/marketCalendar");
const { getEnabledExchanges } = require("../config/exchangeMapping");

// Every 15 minutes on weekdays (UTC); market-specific local hours are below.
const CRON_EXPRESSION = "*/15 * * * 1-5";
// Daily at 03:00 UTC, when neither New York nor Helsinki is trading. Also
// runs the AI model check.
const CLEANUP_CRON_EXPRESSION = "0 3 * * *";
// From 17:00 New York time, after the final US candle (16:15) is stored.
// Repeats every 30 minutes until 20:30, so failed emails are retried and a
// scheduler restarted in that window still sends the day's digest.
const DIGEST_CRON_EXPRESSION = "0,30 17-20 * * 1-5";
const DIGEST_TIME_ZONE = "America/New_York";

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

// The digest describes the New York market day, so its date decides. A
// Helsinki-only setup still gets one, because Helsinki has closed by then.
const hadTradingSession = (
  date = new Date(),
  enabledExchanges = getEnabledExchanges(),
) => {
  const localDate = dailyDigestService.getDigestDate(date);
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();

  if (weekday === 0 || weekday === 6) return false;

  return enabledExchanges.some(
    (exchange) =>
      !getCalendarDay(exchange, localDate.slice(0, 4), localDate)?.closed,
  );
};

// Disabled exchanges are never fetched, even while their market is open.
const getOpenExchanges = (
  date = new Date(),
  markets = MARKET_HOURS,
  enabledExchanges = getEnabledExchanges(),
) =>
  [...new Set(markets.flatMap((market) =>
    (market.exchanges || []).filter((exchange) =>
      enabledExchanges.includes(exchange) && isOpenAt(market, exchange, date)),
  ))];

const isMarketOpen = (
  date = new Date(),
  markets = MARKET_HOURS,
  enabledExchanges = getEnabledExchanges(),
) => getOpenExchanges(date, markets, enabledExchanges).length > 0;

const createMarketScheduler = ({
  updatePrices = updateStockPrices,
  getExchanges = getOpenExchanges,
  cleanup = cleanupOldData,
  checkAiModel = groqService.checkGroqModel,
  pingHeartbeat = heartbeatService.pingHeartbeat,
  sendDigests = dailyDigestService.sendDailyDigests,
  hasTradingSession = hadTradingSession,
} = {}) => {
  const stopController = new AbortController();
  let currentRun = null;
  let currentCleanup = null;
  let currentModelCheck = null;
  let currentDigest = null;

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
      errorTracking.captureError(error, { exchanges });
    }

    // Separate from the price update, so a failed update still retries
    // earlier alert emails, and a failed retry never hides the update.
    if (stopController.signal.aborted) return;

    try {
      const emails = await alertService.retryAlertEmails();

      if (emails.sent + emails.failed + emails.cancelled > 0) {
        logger.info(emails, "Alert emails retried");
      }
    } catch (error) {
      logger.error({ err: error }, "Alert email retry failed");
      errorTracking.captureError(error);
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

  const cleanupAndLog = async () => {
    try {
      const deleted = await cleanup();

      logger.info({ deleted }, "Old data cleaned up");
    } catch (error) {
      logger.error({ err: error }, "Data cleanup failed");
      errorTracking.captureError(error);
      return;
    }

    // Only after a successful cleanup, so the heartbeat monitor also alerts
    // when the scheduler runs but its daily job keeps failing.
    await pingHeartbeat();
  };

  const checkModelAndLog = async () => {
    try {
      const { status, reason } = await checkAiModel();

      if (status === "failing") {
        errorTracking.captureError(new Error(reason));
      }
    } catch (error) {
      logger.error({ err: error }, "AI model check failed");
      errorTracking.captureError(error);
    }
  };

  const runModelCheck = () => {
    if (stopController.signal.aborted || currentModelCheck) return null;

    currentModelCheck = checkModelAndLog().finally(() => {
      currentModelCheck = null;
    });
    return currentModelCheck;
  };

  // Runs alongside price updates: it deletes only rows they never read.
  const runCleanup = () => {
    if (stopController.signal.aborted || currentCleanup) return null;

    currentCleanup = cleanupAndLog().finally(() => {
      currentCleanup = null;
    });
    return currentCleanup;
  };

  const digestAndLog = async () => {
    try {
      const result = await sendDigests({ signal: stopController.signal });
      const { queued, expired, sent, failed, cancelled } = result;

      if (queued + expired + sent + failed + cancelled > 0) {
        logger.info(result, "Daily digests processed");
      }
    } catch (error) {
      if (stopController.signal.aborted) return;

      logger.error({ err: error }, "Daily digest run failed");
      errorTracking.captureError(error);
    }
  };

  const runDigest = (date = new Date()) => {
    if (stopController.signal.aborted || currentDigest) return null;

    if (!hasTradingSession(date)) {
      logger.debug("No trading session today, skipping the daily digest");
      return null;
    }

    currentDigest = digestAndLog().finally(() => {
      currentDigest = null;
    });
    return currentDigest;
  };

  const task = cron.createTask(CRON_EXPRESSION, run, { timezone: "UTC" });
  const digestTask = cron.createTask(
    DIGEST_CRON_EXPRESSION,
    () => {
      runDigest();
    },
    { timezone: DIGEST_TIME_ZONE },
  );
  const cleanupTask = cron.createTask(
    CLEANUP_CRON_EXPRESSION,
    () => {
      runCleanup();
      runModelCheck();
    },
    { timezone: "UTC" },
  );

  const start = async () => {
    task.start();
    cleanupTask.start();
    digestTask.start();
    logger.info(
      {
        schedule: CRON_EXPRESSION,
        cleanupSchedule: CLEANUP_CRON_EXPRESSION,
        digestSchedule: `${DIGEST_CRON_EXPRESSION} ${DIGEST_TIME_ZONE}`,
      },
      "Market scheduler started",
    );
    // Each deploy restarts the scheduler, so a model removed since the last
    // daily check is reported right away. Runs alongside the price update.
    runModelCheck();
    await run();
  };

  const stop = async () => {
    task.stop();
    cleanupTask.stop();
    digestTask.stop();
    stopController.abort();
    await Promise.all([
      currentRun,
      currentCleanup,
      currentModelCheck,
      currentDigest,
    ]);
    logger.info("Market scheduler stopped");
  };

  return { start, stop, run, runCleanup, runModelCheck, runDigest };
};

module.exports = {
  MARKET_HOURS,
  isMarketOpen,
  getOpenExchanges,
  hadTradingSession,
  createMarketScheduler,
};
