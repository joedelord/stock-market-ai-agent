const watchlistModel = require("../models/watchlistModel");
const stockModel = require("../models/stockModel");

const getWatchlistStocks = async (req, res, next) => {
  try {
    const stocks = await watchlistModel.getWatchlistStocks(req.user.id);

    return res.json({ stocks });
  } catch (error) {
    return next(error);
  }
};

const createWatchlistStock = async (req, res, next) => {
  try {
    const stock = await stockModel.getStockById(req.body.stockId);

    if (!stock || !stock.is_active) {
      return res.status(404).json({
        error: "Active stock not found",
      });
    }

    const added = await watchlistModel.addWatchlistStock(req.user.id, stock.id);

    // Following a stock that is already on the list is not an error.
    return res.status(added ? 201 : 200).json({ stock });
  } catch (error) {
    return next(error);
  }
};

const deleteWatchlistStock = async (req, res, next) => {
  try {
    await watchlistModel.removeWatchlistStock(
      req.user.id,
      req.validatedParams.id,
    );

    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getWatchlistStocks,
  createWatchlistStock,
  deleteWatchlistStock,
};
