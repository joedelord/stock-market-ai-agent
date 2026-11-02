require("../config/env");

const { fetchStockPrices } = require("../services/marketDataService");
const { isExchangeEnabled } = require("../config/exchangeMapping");

const TEST_STOCKS = [
  { symbol: "AAPL", exchange: "XNAS" },
  { symbol: "IBM", exchange: "XNYS" },
  { symbol: "NOKIA", exchange: "XHEL" },
];

const testMarketData = async () => {
  // Disabled exchanges may not be covered by the Twelve Data plan.
  const stocks = TEST_STOCKS.filter(({ exchange }) =>
    isExchangeEnabled(exchange),
  );

  for (const { symbol, exchange } of stocks) {
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
