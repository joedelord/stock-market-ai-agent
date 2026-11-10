const alertModel = require("../models/alertModel");
const notificationModel = require("../models/notificationModel");
const stockModel = require("../models/stockModel");
const emailService = require("./emailService");
const { getExchangeTimeZone } = require("../config/exchangeMapping");
const logger = require("../utils/logger");
const { parseDecimal } = require("../utils/parseDecimal");
const { createUnsubscribeToken } = require("../utils/unsubscribeToken");

const PRICE_INTERVAL = "15min";

const MAX_EMAIL_ATTEMPTS = 5;
// The scheduler runs every 15 minutes, so a failed email is retried on the
// next run.
const EMAIL_RETRY_DELAY_MS = 10 * 60 * 1000;
const EMAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Keeps one run from spending a large share of Gmail's daily sending limit
// (about 500 emails for a personal account).
const MAX_EMAILS_PER_RUN = 100;
// 429 from the Gmail API; 421 and 452 are the SMTP "try again later" codes.
const RATE_LIMIT_STATUS = 429;
const SMTP_RATE_LIMIT_CODES = [421, 452];

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

const isRateLimitError = (error) =>
  error.status === RATE_LIMIT_STATUS ||
  SMTP_RATE_LIMIT_CODES.includes(error.responseCode);

// Sends pending alert emails one at a time, so a burst of alerts does not hit
// the provider's rate limit. Stops at the first rate limit; the rest stay
// pending for the next run. notificationIds limits it to those notifications.
const sendAlertEmails = async ({ notificationIds = null } = {}) => {
  const summary = { sent: 0, failed: 0, cancelled: 0, rateLimited: false };

  while (summary.sent + summary.failed < MAX_EMAILS_PER_RUN) {
    const email = await notificationModel.claimAlertEmail({
      notificationIds,
      maxAgeMs: EMAIL_MAX_AGE_MS,
      retryDelayMs: EMAIL_RETRY_DELAY_MS,
    });

    if (!email) break;

    // The user may have turned alert emails off since the alert fired.
    if (!email.email_verified_at || !email.email_alerts_enabled) {
      await notificationModel.cancelAlertEmail(email.id);
      summary.cancelled += 1;
      continue;
    }

    try {
      await emailService.sendAlertNotificationEmail(
        email.email,
        email.message,
        createUnsubscribeToken(email.user_id),
      );
      await notificationModel.markAlertEmailSent(email.id);
      summary.sent += 1;
    } catch (error) {
      await notificationModel.recordAlertEmailFailure(
        email.id,
        MAX_EMAIL_ATTEMPTS,
      );
      summary.failed += 1;

      logger.error(
        { err: error, notificationId: email.id, attempt: email.email_attempts },
        "Failed to send alert email",
      );

      if (isRateLimitError(error)) {
        summary.rateLimited = true;
        break;
      }
    }
  }

  return summary;
};

// Retries alert emails that failed earlier. Run after each price update.
const retryAlertEmails = async () => {
  const expired = await notificationModel.expireAlertEmails(EMAIL_MAX_AGE_MS);

  if (expired > 0) {
    logger.warn({ expired }, "Gave up on alert emails older than a day");
  }

  return sendAlertEmails();
};

// Returns the notifications created for this stock's alerts. They are saved
// before any email is sent, so a failed email never loses the notification.
const checkStockAlerts = async (stock) => {
  const latest = await getLatestPrice(stock);

  if (!latest) return [];

  const notifications = await alertModel.triggerAlerts(
    stock.id,
    latest,
    (alert) => buildAlertMessage(stock, alert, latest.price),
  );

  const pendingIds = notifications
    .filter((notification) => notification.email_status === "pending")
    .map((notification) => notification.id);

  if (pendingIds.length > 0) {
    await sendAlertEmails({ notificationIds: pendingIds });
  }

  return notifications;
};

module.exports = {
  MAX_EMAIL_ATTEMPTS,
  buildAlertMessage,
  checkStockAlerts,
  retryAlertEmails,
};
