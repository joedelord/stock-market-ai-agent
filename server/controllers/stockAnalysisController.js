const stockModel = require("../models/stockModel");
const { calculateStockMetrics } = require("../services/stockMetrics");
const { generateStockAnalysis } = require("../services/groqService");

const ANALYSIS_PRICE_LIMIT = 100;
const ANALYSIS_INTERVAL = "15min";

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

    const analysis = await generateStockAnalysis({
      stock,
      metrics,
    });

    res.set("Cache-Control", "no-store");

    return res.json({
      stock,
      metrics,
      analysis,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createStockAnalysis,
};
