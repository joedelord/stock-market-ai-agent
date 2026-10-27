const stockModel = require("../models/stockModel");
const marketDataService = require("./marketDataService");
const { getMicCode } = require("../config/exchangeMapping");
const HttpError = require("../utils/httpError");

const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;

// Other instrument types (ETFs, funds, warrants) are not stocks the
// dashboard is built for.
const STOCK_INSTRUMENT_TYPE = "Common Stock";

const toKey = (stock) => `${stock.symbol}:${stock.exchange}`;

const fetchProviderResults = async (query) => {
  try {
    return await marketDataService.searchStocks(query);
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new HttpError(
        GATEWAY_TIMEOUT,
        "Stock search timed out. Please try again.",
        { cause: error },
      );
    }

    throw new HttpError(BAD_GATEWAY, "Stock search service returned an error.", {
      cause: error,
    });
  }
};

// Returns the provider's stocks on supported exchanges in our format, marked
// with whether they are already in the database.
const searchProviderStocks = async (query) => {
  if (!process.env.TWELVE_DATA_API_KEY?.trim()) {
    throw new HttpError(SERVICE_UNAVAILABLE, "Stock search is not configured.");
  }

  const items = await fetchProviderResults(query);
  const results = new Map();

  for (const item of items) {
    const exchange = getMicCode(item.exchange);

    if (item.instrument_type !== STOCK_INSTRUMENT_TYPE || !exchange) {
      continue;
    }

    const result = {
      symbol: item.symbol,
      exchange,
      name: item.instrument_name,
      currency: item.currency,
      country: item.country,
    };

    if (!results.has(toKey(result))) {
      results.set(toKey(result), result);
    }
  }

  if (results.size === 0) {
    return [];
  }

  const existing = await stockModel.getStocksBySymbolAndExchange([
    ...results.values(),
  ]);

  const existingIds = new Map(existing.map((stock) => [toKey(stock), stock.id]));

  return [...results.values()].map((result) => ({
    ...result,
    stockId: existingIds.get(toKey(result)) ?? null,
  }));
};

module.exports = {
  searchProviderStocks,
};
