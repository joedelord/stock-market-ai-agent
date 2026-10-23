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

const getExchangeTimeZone = (exchange) =>
  EXCHANGE_TIME_ZONES[exchange] ?? DEFAULT_TIME_ZONE;

const getProviderExchange = (exchange) => {
  const providerExchange = PROVIDER_EXCHANGES[exchange];

  if (!providerExchange) {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  return providerExchange;
};

module.exports = {
  getExchangeTimeZone,
  getProviderExchange,
};
