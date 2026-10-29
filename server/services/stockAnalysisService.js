const stockAnalysisModel = require("../models/stockAnalysisModel");
const {
  generateStockAnalysis,
  getAnalysisCacheKey,
} = require("./groqService");

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

    return {
      analysis: latest.analysis,
      cached: true,
      stale: true,
      metrics: latest.metrics,
      news: latest.news,
    };
  }
};

module.exports = {
  getOrCreateStockAnalysis,
};
