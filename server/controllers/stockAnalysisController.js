const stockModel = require("../models/stockModel");
const {
  calculateStockMetrics,
  calculateDailyVolatility,
  calculateDayMovement,
  calculateSessionActivity,
} = require("../services/stockMetrics");
const { getOrCreateStockAnalysis } = require("../services/stockAnalysisService");
const { getStockNews } = require("../services/stockNewsService");

const ANALYSIS_PRICE_LIMIT = 100;
const ANALYSIS_INTERVAL = "15min";
// About 60 trading days of 15-minute bars on the longest supported session,
// for volatility and the volume baseline.
const HISTORY_PRICE_LIMIT = 2500;

const createStockAnalysis = async (req, res, next) => {
  try {
    const stockId = req.validatedParams.id;

    const stock = await stockModel.getStockById(stockId);

    if (!stock) {
      return res.status(404).json({
        error: "Stock not found",
      });
    }

    // Prices of inactive stocks are no longer updated, so the analysis
    // would describe stale data.
    if (!stock.is_active) {
      return res.status(409).json({
        error: "Stock is inactive",
      });
    }

    // Prices come oldest first, so the period metrics use the latest bars of
    // the same history that volatility and volume baselines need.
    const history = await stockModel.getStockPrices(
      stockId,
      HISTORY_PRICE_LIMIT,
      ANALYSIS_INTERVAL,
    );

    const metrics = calculateStockMetrics(
      history.slice(-ANALYSIS_PRICE_LIMIT),
      ANALYSIS_INTERVAL,
    );

    const quote = await stockModel.getStockQuote(stockId);
    const volatility = quote?.price_time
      ? calculateDailyVolatility(history, stock.exchange, quote.price_time)
      : null;

    metrics.dayMovement = calculateDayMovement(quote, volatility);
    metrics.sessionActivity = calculateSessionActivity(history, stock.exchange);

    const news = await getStockNews({ stock, dayMovement: metrics.dayMovement });

    const result = await getOrCreateStockAnalysis({
      stock,
      metrics,
      news,
    });

    res.set("Cache-Control", "no-store");

    return res.json({
      stock,
      metrics: result.metrics,
      analysis: result.analysis,
      cached: result.cached,
      stale: result.stale,
      news: result.news,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createStockAnalysis,
};
