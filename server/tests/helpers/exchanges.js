const US_EXCHANGES = "XNAS,XNYS";

// tests/setup.js enables Helsinki too. Call inside a describe block to run
// its tests with the default US-only configuration.
const useUsExchangesOnly = () => {
  let original;

  beforeEach(() => {
    original = process.env.ENABLED_EXCHANGES;
    process.env.ENABLED_EXCHANGES = US_EXCHANGES;
  });

  afterEach(() => {
    process.env.ENABLED_EXCHANGES = original;
  });
};

module.exports = {
  useUsExchangesOnly,
};
