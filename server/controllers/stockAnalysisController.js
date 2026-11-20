const stockModel = require("../models/stockModel");
const stockAnalysisService = require("../services/stockAnalysisService");

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

    const input = await stockAnalysisService.buildStockAnalysisInput(stock);
    const result = await stockAnalysisService.getOrCreateStockAnalysis(input);

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
