require("../config/env");

const { fetchStockPrices } = require("../services/marketDataService");

const TEST_STOCKS = [
  { symbol: "AAPL", exchange: "XNAS" },
  { symbol: "NOKIA", exchange: "XHEL" },
];

const testMarketData = async () => {
  for (const { symbol, exchange } of TEST_STOCKS) {
    try {
      const result = await fetchStockPrices({
        symbol,
        exchange,
        interval: "15min",
        outputSize: 5,
      });

      console.log(`\n${symbol} (${exchange})`);
      console.table(result.prices);
    } catch (error) {
      console.error(`${symbol} (${exchange}): ${error.message}`);
      process.exitCode = 1;
    }
  }
};

testMarketData();
