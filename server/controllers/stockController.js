const stockModel = require("../models/stockModel");

const UNIQUE_VIOLATION = "23505";

const getStocks = async (req, res, next) => {
  try {
    const stocks = await stockModel.getAllStocks();

    return res.json({ stocks });
  } catch (error) {
    return next(error);
  }
};

const getStockById = async (req, res, next) => {
  try {
    const stock = await stockModel.getStockById(req.validatedParams.id);

    if (!stock) {
      return res.status(404).json({
        error: "Stock not found",
      });
    }

    return res.json({ stock });
  } catch (error) {
    return next(error);
  }
};

const createStock = async (req, res, next) => {
  try {
    const { symbol, exchange, name, currency } = req.body;

    const stock = await stockModel.createStock({
      symbol,
      exchange,
      name,
      currency,
    });

    return res.status(201).json({ stock });
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return res.status(409).json({
        error: "Stock already exists",
      });
    }

    return next(error);
  }
};

const getStockPrices = async (req, res, next) => {
  try {
    const stockId = req.validatedParams.id;
    const { limit } = req.validatedQuery;

    const stock = await stockModel.getStockById(stockId);

    if (!stock) {
      return res.status(404).json({
        error: "Stock not found",
      });
    }

    const [prices, quote] = await Promise.all([
      stockModel.getStockPrices(stockId, limit),
      stockModel.getStockQuote(stockId),
    ]);

    return res.json({
      stock,
      prices,
      // Always present, so clients can rely on the field.
      quote: quote ?? null,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getStocks,
  getStockById,
  createStock,
  getStockPrices,
};
