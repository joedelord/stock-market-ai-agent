const { setTimeout: wait } = require("timers/promises");

const stockModel = require("../models/stockModel");
const marketDataService = require("../services/marketDataService");

const INTERVAL = "15min";
const OUTPUT_SIZE = 5;
const REQUEST_DELAY_MS = 8000;

// exchanges is optional: manual updates can still process every active stock.
const updateStockPrices = async ({
  delayMs = REQUEST_DELAY_MS,
  signal,
  exchanges,
} = {}) => {
  if (signal?.aborted) return [];

  const stocks = await stockModel.getAllStocks();
  const activeStocks = stocks.filter(
    (stock) =>
      stock.is_active &&
      (!exchanges || exchanges.includes(stock.exchange)),
  );

  const results = [];

  for (const [index, stock] of activeStocks.entries()) {
    if (index > 0) {
      await wait(delayMs, undefined, { signal }).catch(() => {});
    }

    if (signal?.aborted) break;

    try {
      const data = await marketDataService.fetchStockPrices({
        symbol: stock.symbol,
        exchange: stock.exchange,
        interval: INTERVAL,
        outputSize: OUTPUT_SIZE,
        signal,
      });

      // Finish the stock already in progress, then stop before the next one.
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

module.exports = { updateStockPrices };
