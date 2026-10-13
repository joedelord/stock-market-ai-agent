const { getProviderExchange } = require("../config/exchangeMapping");

const BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 15000;

// Twelve Data puts the useful error message in a JSON body with status
// "error", sometimes even with HTTP 200, so the body is checked first.
const requestTwelveData = async (path, params) => {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is missing");
  }

  const url = new URL(path, BASE_URL);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => null);

  if (data?.status === "error") {
    throw new Error(data.message || "Twelve Data request failed");
  }

  if (!response.ok || !data) {
    throw new Error(`Twelve Data HTTP error: ${response.status}`);
  }

  return data;
};

const fetchStockPrices = async ({
  symbol,
  exchange,
  interval = "15min",
  outputSize = 30,
}) => {
  const data = await requestTwelveData("/time_series", {
    symbol,
    exchange: getProviderExchange(exchange),
    interval,
    outputsize: outputSize,
    timezone: "UTC",
  });

  if (!Array.isArray(data.values)) {
    throw new Error("Invalid Twelve Data response");
  }

  return {
    symbol: data.meta?.symbol ?? symbol,
    interval,
    prices: data.values.map((item) => ({
      priceTime: item.datetime,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume ?? null,
    })),
  };
};

const searchStocks = async (query) => {
  const data = await requestTwelveData("/symbol_search", {
    symbol: query,
  });

  return data.data ?? [];
};

module.exports = {
  fetchStockPrices,
  searchStocks,
};
