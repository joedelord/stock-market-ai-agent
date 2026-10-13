require("../config/env");

const { searchStocks } = require("../services/marketDataService");

// Usage: node scripts/searchStocks.js NOKIA
const runSearch = async () => {
  try {
    const query = process.argv[2] ?? "NOKIA";

    const stocks = await searchStocks(query);

    console.table(
      stocks.map((stock) => ({
        symbol: stock.symbol,
        name: stock.instrument_name,
        exchange: stock.exchange,
        mic: stock.mic_code,
        country: stock.country,
        currency: stock.currency,
      })),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

runSearch();
