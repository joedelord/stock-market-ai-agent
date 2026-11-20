const stockAnalysisModel = require("../models/stockAnalysisModel");
const stockModel = require("../models/stockModel");
const logger = require("../utils/logger");
const {
  generateStockAnalysis,
  getAnalysisCacheKey,
} = require("./groqService");
const {
  calculateStockMetrics,
  calculateDailyVolatility,
  calculateDayMovement,
  calculateSessionActivity,
} = require("./stockMetrics");
const { getStockNews } = require("./stockNewsService");

const ANALYSIS_PRICE_LIMIT = 100;
const ANALYSIS_INTERVAL = "15min";
// About 60 trading days of 15-minute bars on the longest supported session,
// for volatility and the volume baseline.
const HISTORY_PRICE_LIMIT = 2500;

// Prices update every 15 minutes, so a new bar usually changes the key well
// before this; the limit only stops old answers from living forever.
const ANALYSIS_CACHE_TTL_MS = 30 * 60 * 1000;
// When Groq is busy, an older analysis beats an error. Older than this, it
// describes a market too different from the current one to be useful.
const STALE_ANALYSIS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
// A news outage is temporary, so an answer written without news is not
// stored; the next request can include the news once it is back.
const UNCACHED_NEWS_STATUSES = new Set(["unavailable"]);

// Requests with the same key that arrive while Groq is still answering share
// one Groq call instead of each spending quota.
const inFlight = new Map();

const createAnalysis = async (stock, cacheKey, input) => {
  const analysis = await generateStockAnalysis(input);

  if (!UNCACHED_NEWS_STATUSES.has(input.news?.status)) {
    await stockAnalysisModel.deleteExpiredStockAnalyses(STALE_ANALYSIS_MAX_AGE_MS);
    await stockAnalysisModel.saveStockAnalysis(
      stock.id,
      cacheKey,
      analysis,
      input.metrics,
      input.news,
    );
  }

  return analysis;
};

const getOrCreateFreshAnalysis = async (input) => {
  const { stock } = input;
  const cacheKey = getAnalysisCacheKey(input);

  const stored = await stockAnalysisModel.getStockAnalysis(
    stock.id,
    cacheKey,
    ANALYSIS_CACHE_TTL_MS,
  );

  if (stored) return { analysis: stored.analysis, cached: true };

  const flightKey = `${stock.id}:${cacheKey}`;
  const pending = inFlight.get(flightKey);

  if (pending) return { analysis: await pending, cached: true };

  const promise = createAnalysis(stock, cacheKey, input);
  inFlight.set(flightKey, promise);

  try {
    return { analysis: await promise, cached: false };
  } finally {
    inFlight.delete(flightKey);
  }
};

// A stale analysis comes with the metrics and news it was written from,
// because its numbers and [n] citations refer to those, not the current ones.
const getOrCreateStockAnalysis = async ({ stock, metrics, news }) => {
  try {
    const result = await getOrCreateFreshAnalysis({ stock, metrics, news });

    return { ...result, stale: false, metrics, news };
  } catch (error) {
    if (!error.rateLimited) throw error;

    const latest = await stockAnalysisModel.getLatestStockAnalysis(
      stock.id,
      STALE_ANALYSIS_MAX_AGE_MS,
    );

    if (!latest) throw error;

    // The request succeeds, so without this a busy Groq would not show in
    // the logs at all.
    logger.info(
      { stockId: stock.id, analysisCreatedAt: latest.created_at },
      "Groq busy, returned a stale analysis",
    );

    return {
      analysis: latest.analysis,
      cached: true,
      stale: true,
      metrics: latest.metrics,
      news: latest.news,
    };
  }
};

// The metrics and news the model is given. Shared by the analysis endpoint
// and the daily summary, so both describe a stock the same way and can reuse
// each other's stored analyses.
const buildStockAnalysisInput = async (stock) => {
  // Prices come oldest first, so the period metrics use the latest bars of
  // the same history that volatility and volume baselines need.
  const history = await stockModel.getStockPrices(
    stock.id,
    HISTORY_PRICE_LIMIT,
    ANALYSIS_INTERVAL,
  );

  const metrics = calculateStockMetrics(
    history.slice(-ANALYSIS_PRICE_LIMIT),
    ANALYSIS_INTERVAL,
  );

  const quote = await stockModel.getStockQuote(stock.id);
  const volatility = quote?.price_time
    ? calculateDailyVolatility(history, stock.exchange, quote.price_time)
    : null;

  metrics.dayMovement = calculateDayMovement(quote, volatility);
  metrics.sessionActivity = calculateSessionActivity(history, stock.exchange);

  const news = await getStockNews({ stock, dayMovement: metrics.dayMovement });

  return { stock, metrics, news };
};

module.exports = {
  buildStockAnalysisInput,
  getOrCreateStockAnalysis,
};
