const { setTimeout: wait } = require("timers/promises");

const alertModel = require("../models/alertModel");
const digestModel = require("../models/digestModel");
const stockModel = require("../models/stockModel");
const watchlistModel = require("../models/watchlistModel");
const emailService = require("./emailService");
const marketDataService = require("./marketDataService");
const stockAnalysisService = require("./stockAnalysisService");
const logger = require("../utils/logger");
const { parseDecimal } = require("../utils/parseDecimal");
const { createUnsubscribeToken } = require("../utils/unsubscribeToken");

// The digest describes the US market day; Helsinki has closed by then too.
const DIGEST_TIME_ZONE = "America/New_York";

const MAX_DIGEST_ATTEMPTS = 3;
// The scheduler runs the digest every 30 minutes, so a failed email is
// retried on the next run.
const DIGEST_RETRY_DELAY_MS = 25 * 60 * 1000;
// Keeps one run from spending a large share of Gmail's daily sending limit.
const MAX_DIGESTS_PER_RUN = 200;

// Stored quotes are refreshed at most hourly during the day, so the last one
// can be from well before the close. The first digest run fetches a final
// quote (one Twelve Data credit per stock); later runs that day reuse it.
const QUOTE_REFRESH_AGE_MS = 45 * 60 * 1000;
// Twelve Data's Basic plan allows 8 requests a minute.
const QUOTE_REQUEST_DELAY_MS = 8000;

// Only stocks whose day move was significant get an AI explanation, and only
// this many per run, so the Groq quota grows with the number of unusual
// moves, not with the number of users.
const MAX_EXPLAINED_STOCKS = 10;
// Each analysis may reserve 2 x 500 output tokens of Groq's 1000 a minute on
// the free tier, so new analyses are spaced out.
const GROQ_REQUEST_DELAY_MS = 30_000;

const MAX_MOVERS_PER_DIGEST = 3;
// A price alert this close to its threshold is worth a heads-up.
const NEAR_ALERT_PERCENT = 3;
const PRICE_ALERT_TYPES = new Set(["price_above", "price_below"]);

// en-CA formats dates as YYYY-MM-DD, the format of a DATE column.
const getDigestDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: DIGEST_TIME_ZONE }).format(date);

const isAbortError = (error) => error?.name === "AbortError";

const refreshQuotes = async (stocks, { signal, delayMs }) => {
  let hasRequested = false;

  for (const stock of stocks) {
    if (signal?.aborted) return;

    const stored = await stockModel.getStockQuote(stock.id);
    const age = stored
      ? Date.now() - new Date(stored.fetched_at).getTime()
      : Infinity;

    if (age < QUOTE_REFRESH_AGE_MS) continue;

    try {
      if (hasRequested) await wait(delayMs, undefined, { signal });
      hasRequested = true;

      const quote = await marketDataService.fetchStockQuote({
        symbol: stock.symbol,
        exchange: stock.exchange,
        signal,
      });

      await stockModel.saveStockQuote(stock.id, quote);
    } catch (error) {
      if (isAbortError(error)) return;

      // The stored quote is still usable, only older.
      logger.warn(
        { symbol: stock.symbol, exchange: stock.exchange, err: error },
        "Digest quote refresh failed",
      );
    }
  }
};

// Unusual first: moves measured against the stock's own volatility when that
// is known, otherwise against the fixed threshold.
const getMoveScore = (dayMovement) =>
  dayMovement.moveInStdDevs ??
  Math.abs(dayMovement.changePercent) / dayMovement.thresholdPercent;

const toExplanation = (result) => {
  const cited = new Set(result.analysis.citedArticles);
  const articles =
    result.news?.status === "available"
      ? result.news.articles.filter((article) => cited.has(article.number))
      : [];

  return {
    priceMovement: result.analysis.sections.priceMovement,
    newsContext: result.analysis.sections.newsContext,
    articles: articles.map(({ number, title, url, source }) => ({
      number,
      title,
      url,
      source,
    })),
  };
};

// Returns a Map of stock id to { dayMovement, explanation }. A stock whose
// data cannot be read is left out, and its row shows no numbers.
const summarizeStocks = async (stocks, { signal, groqDelayMs }) => {
  const summaries = new Map();
  const inputs = [];

  for (const stock of stocks) {
    try {
      const input = await stockAnalysisService.buildStockAnalysisInput(stock);

      inputs.push(input);
      summaries.set(stock.id, {
        dayMovement: input.metrics.dayMovement,
        explanation: null,
      });
    } catch (error) {
      logger.warn(
        { symbol: stock.symbol, exchange: stock.exchange, err: error },
        "Digest stock metrics failed",
      );
    }
  }

  const candidates = inputs
    .filter((input) => input.metrics.dayMovement?.isSignificant)
    .sort(
      (a, b) =>
        getMoveScore(b.metrics.dayMovement) -
        getMoveScore(a.metrics.dayMovement),
    )
    .slice(0, MAX_EXPLAINED_STOCKS);

  let explained = 0;
  let lastCallWasNew = false;

  for (const input of candidates) {
    if (signal?.aborted) break;

    try {
      if (lastCallWasNew) await wait(groqDelayMs, undefined, { signal });

      const result = await stockAnalysisService.getOrCreateStockAnalysis(input);
      lastCallWasNew = !result.cached;

      // A stale analysis describes earlier numbers than the ones in the
      // digest table, so the digest goes without it.
      if (!result.stale) {
        summaries.get(input.stock.id).explanation = toExplanation(result);
        explained += 1;
      }
    } catch (error) {
      if (isAbortError(error)) break;

      logger.warn(
        { symbol: input.stock.symbol, status: error.status, err: error },
        "Digest stock analysis failed",
      );

      // Groq stays busy for a while; the rest of the digest still goes out.
      if (error.rateLimited) break;
    }
  }

  return { summaries, explained };
};

const getNearAlerts = (alerts, summaries) =>
  alerts.flatMap((alert) => {
    const close = summaries.get(alert.stock_id)?.dayMovement?.close;

    if (!alert.is_active || !PRICE_ALERT_TYPES.has(alert.alert_type) || !close) {
      return [];
    }

    const threshold = parseDecimal(alert.threshold);
    const distancePercent = ((threshold - close) / close) * 100;
    const isAhead =
      alert.alert_type === "price_above"
        ? distancePercent > 0
        : distancePercent < 0;

    if (!isAhead || Math.abs(distancePercent) > NEAR_ALERT_PERCENT) return [];

    return [
      {
        symbol: alert.symbol,
        exchange: alert.exchange,
        currency: alert.currency,
        alertType: alert.alert_type,
        threshold,
        close,
        distancePercent,
      },
    ];
  });

// Pure, so the content can be tested without a database or email provider.
const buildUserDigest = ({ digestDate, stocks, summaries, alerts }) => {
  const rows = stocks
    .filter((stock) => stock.is_active)
    .map((stock) => {
      const summary = summaries.get(stock.id);
      const dayMovement = summary?.dayMovement ?? null;

      return {
        symbol: stock.symbol,
        exchange: stock.exchange,
        name: stock.name,
        currency: stock.currency,
        close: dayMovement?.close ?? null,
        changePercent: dayMovement?.changePercent ?? null,
        priceTime: dayMovement?.priceTime ?? null,
        isSignificant: Boolean(dayMovement?.isSignificant),
        explanation: summary?.explanation ?? null,
      };
    })
    .sort((a, b) => {
      if (a.changePercent === null) return b.changePercent === null ? 0 : 1;
      if (b.changePercent === null) return -1;

      return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    });

  return {
    digestDate,
    rows,
    movers: rows
      .filter((row) => row.isSignificant)
      .slice(0, MAX_MOVERS_PER_DIGEST),
    nearAlerts: getNearAlerts(alerts, summaries),
  };
};

const sendPendingDigests = async ({ digestDate, summaries, signal }) => {
  const summary = { sent: 0, failed: 0, cancelled: 0, rateLimited: false };

  while (summary.sent + summary.failed < MAX_DIGESTS_PER_RUN) {
    if (signal?.aborted) break;

    const digest = await digestModel.claimDailyDigest({
      digestDate,
      retryDelayMs: DIGEST_RETRY_DELAY_MS,
    });

    if (!digest) break;

    const { user_id: userId } = digest;

    // The user may have turned the digest off since it was queued.
    if (!digest.email_verified_at || !digest.email_digest_enabled) {
      await digestModel.setDailyDigestStatus(userId, digestDate, "cancelled");
      summary.cancelled += 1;
      continue;
    }

    try {
      const stocks = await watchlistModel.getWatchlistStocks(userId);
      const alerts = await alertModel.getAlerts(userId);
      const content = buildUserDigest({ digestDate, stocks, summaries, alerts });

      if (content.rows.length === 0) {
        await digestModel.setDailyDigestStatus(userId, digestDate, "cancelled");
        summary.cancelled += 1;
        continue;
      }

      await emailService.sendDailyDigestEmail(
        digest.email,
        content,
        createUnsubscribeToken(userId, "digest"),
      );
      await digestModel.setDailyDigestStatus(userId, digestDate, "sent");
      summary.sent += 1;
    } catch (error) {
      await digestModel.recordDailyDigestFailure(
        userId,
        digestDate,
        MAX_DIGEST_ATTEMPTS,
      );
      summary.failed += 1;

      logger.error(
        { err: error, userId, attempt: digest.attempts },
        "Failed to send daily digest",
      );

      if (emailService.isRateLimitError(error)) {
        summary.rateLimited = true;
        break;
      }
    }
  }

  return summary;
};

// Queues today's digests, then explains the day's unusual moves once and
// sends each user their summary. Safe to run several times a day: a digest
// is sent once, and failed ones are retried until they run out of attempts.
const sendDailyDigests = async ({
  date = new Date(),
  signal,
  quoteDelayMs = QUOTE_REQUEST_DELAY_MS,
  groqDelayMs = GROQ_REQUEST_DELAY_MS,
} = {}) => {
  const digestDate = getDigestDate(date);
  const expired = await digestModel.expireDailyDigests(digestDate);
  const queued = await digestModel.createDailyDigests(digestDate);
  const stocks = await digestModel.getPendingDigestStocks({
    digestDate,
    retryDelayMs: DIGEST_RETRY_DELAY_MS,
  });

  if (stocks.length === 0) {
    return { digestDate, queued, expired, explained: 0, sent: 0, failed: 0, cancelled: 0 };
  }

  await refreshQuotes(stocks, { signal, delayMs: quoteDelayMs });

  const { summaries, explained } = await summarizeStocks(stocks, {
    signal,
    groqDelayMs,
  });

  const result = await sendPendingDigests({ digestDate, summaries, signal });

  return { digestDate, queued, expired, explained, ...result };
};

module.exports = {
  MAX_DIGEST_ATTEMPTS,
  getDigestDate,
  buildUserDigest,
  sendDailyDigests,
};
