// Maps our ISO 10383 MIC codes to the exchange names Twelve Data expects.
const PROVIDER_EXCHANGES = {
  XHEL: "OMXH",
  XNAS: "NASDAQ",
  XNYS: "NYSE",
};

// Market days, for example for daily alerts, follow the exchange's local date.
const EXCHANGE_TIME_ZONES = {
  XHEL: "Europe/Helsinki",
  XNAS: "America/New_York",
  XNYS: "America/New_York",
};

const DEFAULT_TIME_ZONE = "UTC";

// Exchanges with real market data. Seeded mock stocks use other codes.
const SUPPORTED_EXCHANGES = Object.keys(PROVIDER_EXCHANGES);

const MIC_CODES = Object.fromEntries(
  Object.entries(PROVIDER_EXCHANGES).map(([mic, provider]) => [provider, mic]),
);

// Twelve Data's own mic_code is not used: Nasdaq stocks come back as XNGS,
// XNMS or XNCM instead of XNAS. Returns undefined for unsupported exchanges.
const getMicCode = (providerExchange) => MIC_CODES[providerExchange];

const getExchangeTimeZone = (exchange) =>
  EXCHANGE_TIME_ZONES[exchange] ?? DEFAULT_TIME_ZONE;

// Twelve Data Basic does not cover Helsinki, so by default only the US
// exchanges are fetched, searched and shown.
const DEFAULT_ENABLED_EXCHANGES = "XNAS,XNYS";

// Read on every call, so tests can switch exchanges without reloading modules.
const getEnabledExchanges = () => {
  const value =
    process.env.ENABLED_EXCHANGES?.trim() || DEFAULT_ENABLED_EXCHANGES;

  const exchanges = [
    ...new Set(
      value
        .split(",")
        .map((exchange) => exchange.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  const unknown = exchanges.filter(
    (exchange) => !SUPPORTED_EXCHANGES.includes(exchange),
  );

  if (unknown.length > 0) {
    throw new Error(
      `Unknown exchange in ENABLED_EXCHANGES: ${unknown.join(", ")}. Supported exchanges: ${SUPPORTED_EXCHANGES.join(", ")}`,
    );
  }

  if (exchanges.length === 0) {
    throw new Error("ENABLED_EXCHANGES must list at least one exchange");
  }

  return exchanges;
};

const isExchangeEnabled = (exchange) =>
  getEnabledExchanges().includes(exchange);

const getProviderExchange = (exchange) => {
  const providerExchange = PROVIDER_EXCHANGES[exchange];

  if (!providerExchange) {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  return providerExchange;
};

module.exports = {
  SUPPORTED_EXCHANGES,
  getEnabledExchanges,
  getExchangeTimeZone,
  getMicCode,
  getProviderExchange,
  isExchangeEnabled,
};
