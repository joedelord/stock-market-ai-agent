const stockModel = require("../models/stockModel");
const {
  calculateStockMetrics,
  calculateDailyVolatility,
  calculateDayMovement,
} = require("../services/stockMetrics");
const { getOrCreateStockAnalysis } = require("../services/stockAnalysisService");
const { getStockNews } = require("../services/stockNewsService");

const ANALYSIS_PRICE_LIMIT = 100;
const ANALYSIS_INTERVAL = "15min";
// About 60 trading days of 15-minute bars on the longest supported session.
const VOLATILITY_PRICE_LIMIT = 2500;

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

    const prices = await stockModel.getStockPrices(
      stockId,
      ANALYSIS_PRICE_LIMIT,
      ANALYSIS_INTERVAL,
    );

    const metrics = calculateStockMetrics(prices, ANALYSIS_INTERVAL);

    const quote = await stockModel.getStockQuote(stockId);
    let volatility = null;

    if (quote?.price_time) {
      const history = await stockModel.getStockPrices(
        stockId,
        VOLATILITY_PRICE_LIMIT,
        ANALYSIS_INTERVAL,
      );
      volatility = calculateDailyVolatility(history, stock.exchange, quote.price_time);
    }

    metrics.dayMovement = calculateDayMovement(quote, volatility);

    const news = await getStockNews({ stock, dayMovement: metrics.dayMovement });

    const { analysis, cached } = await getOrCreateStockAnalysis({
      stock,
      metrics,
      news,
    });

    res.set("Cache-Control", "no-store");

    return res.json({
      stock,
      metrics,
      analysis,
      cached,
      news,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createStockAnalysis,
};
