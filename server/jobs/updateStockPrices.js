const { setTimeout: wait } = require("timers/promises");

const stockModel = require("../models/stockModel");
const marketDataService = require("../services/marketDataService");

const INTERVAL = "15min";
const OUTPUT_SIZE = 5;

// The Twelve Data free plan allows 8 requests per minute.
const REQUEST_DELAY_MS = 8000;

// One failing stock must not stop the others, so errors are collected per
// stock instead of thrown. Aborting `signal` stops the run before the next
// stock, so a shutdown does not wait for the whole list.
const updateStockPrices = async ({
  delayMs = REQUEST_DELAY_MS,
  signal,
} = {}) => {
  const stocks = await stockModel.getAllStocks();
  const activeStocks = stocks.filter((stock) => stock.is_active);

  const results = [];

  for (const [index, stock] of activeStocks.entries()) {
    if (index > 0) {
      // The wait rejects only when the signal is aborted, checked below.
      await wait(delayMs, undefined, { signal }).catch(() => {});
    }

    if (signal?.aborted) {
      break;
    }

    try {
      const data = await marketDataService.fetchStockPrices({
        symbol: stock.symbol,
        exchange: stock.exchange,
        interval: INTERVAL,
        outputSize: OUTPUT_SIZE,
      });

      const saved = await stockModel.saveStockPrices(
        stock.id,
        data.interval,
        data.prices,
      );

      results.push({
        symbol: stock.symbol,
        exchange: stock.exchange,
        status: "success",
        saved,
      });
    } catch (error) {
      results.push({
        symbol: stock.symbol,
        exchange: stock.exchange,
        status: "error",
        error: error.message,
      });
    }
  }

  return results;
};

module.exports = {
  updateStockPrices,
};
