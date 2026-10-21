const { getProviderExchange } = require("../config/exchangeMapping");
const { parseDecimal } = require("../utils/parseDecimal");

const BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 15000;

// Twelve Data puts the useful error message in a JSON body with status
// "error", sometimes even with HTTP 200, so the body is checked first.
const requestTwelveData = async (path, params, signal) => {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is missing");
  }

  const url = new URL(path, BASE_URL);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  url.searchParams.set("apikey", apiKey);

  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  const response = await fetch(url, {
    signal: requestSignal,
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
  signal,
}) => {
  const data = await requestTwelveData(
    "/time_series",
    {
      symbol,
      exchange: getProviderExchange(exchange),
      interval,
      outputsize: outputSize,
      timezone: "UTC",
    },
    signal,
  );

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

const searchStocks = async (query, { signal } = {}) => {
  const data = await requestTwelveData(
    "/symbol_search",
    { symbol: query },
    signal,
  );

  return data.data ?? [];
};

const fetchStockQuote = async ({ symbol, exchange, signal }) => {
  const data = await requestTwelveData(
    "/quote",
    {
      symbol,
      exchange: getProviderExchange(exchange),
    },
    signal,
  );

  const close = parseDecimal(data.close);
  const previousClose = parseDecimal(data.previous_close);
  const timestamp = Number(data.timestamp);

  if (
    !Number.isFinite(close) ||
    close <= 0 ||
    !Number.isFinite(previousClose) ||
    previousClose <= 0 ||
    !Number.isInteger(timestamp) ||
    timestamp <= 0
  ) {
    throw new Error("Invalid Twelve Data quote response");
  }

  // The day change is calculated from these when the quote is read.
  return {
    priceTime: new Date(timestamp * 1000).toISOString(),
    close,
    previousClose,
  };
};

module.exports = {
  fetchStockPrices,
  searchStocks,
  fetchStockQuote,
};
