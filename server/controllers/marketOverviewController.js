const marketOverviewModel = require("../models/marketOverviewModel");
const marketOverview = require("../services/marketOverview");

const getMarketOverview = async (req, res, next) => {
  try {
    const { market } = req.validatedQuery;

    const stocks = await marketOverviewModel.getOverviewStocks(
      marketOverview.getMarketExchanges(market),
    );

    return res.json(marketOverview.buildOverview(stocks, market));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMarketOverview,
};
