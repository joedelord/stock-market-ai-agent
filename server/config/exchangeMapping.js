// Maps our ISO 10383 MIC codes to the exchange names Twelve Data expects.
const PROVIDER_EXCHANGES = {
  XHEL: "OMXH",
  XNAS: "NASDAQ",
  XNYS: "NYSE",
};

const getProviderExchange = (exchange) => {
  const providerExchange = PROVIDER_EXCHANGES[exchange];

  if (!providerExchange) {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  return providerExchange;
};

module.exports = {
  getProviderExchange,
};
