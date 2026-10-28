const stockAnalysisModel = require("../models/stockAnalysisModel");
const {
  generateStockAnalysis,
  getAnalysisCacheKey,
} = require("./groqService");

// Prices update every 15 minutes, so a new bar usually changes the key well
// before this; the limit only stops old answers from living forever.
const ANALYSIS_CACHE_TTL_MS = 30 * 60 * 1000;
// A news outage is temporary, so an answer written without news is not
// stored; the next request can include the news once it is back.
const UNCACHED_NEWS_STATUSES = new Set(["unavailable"]);

// Requests with the same key that arrive while Groq is still answering share
// one Groq call instead of each spending quota.
const inFlight = new Map();

const createAnalysis = async (stock, cacheKey, input) => {
  const analysis = await generateStockAnalysis(input);

  if (!UNCACHED_NEWS_STATUSES.has(input.news?.status)) {
    await stockAnalysisModel.deleteExpiredStockAnalyses(ANALYSIS_CACHE_TTL_MS);
    await stockAnalysisModel.saveStockAnalysis(stock.id, cacheKey, analysis);
  }

  return analysis;
};

const getOrCreateStockAnalysis = async ({ stock, metrics, news }) => {
  const input = { stock, metrics, news };
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

module.exports = {
  getOrCreateStockAnalysis,
};
