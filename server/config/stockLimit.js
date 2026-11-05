// Twelve Data's free plan allows about 800 requests a day. The scheduler
// fetches each followed stock every 15 minutes (about 27 times per US trading
// day) plus an hourly quote, so 20 stocks stay safely under the limit.
const DEFAULT_MAX_ACTIVE_STOCKS = 20;

// Read on every call, so tests and the startup check see the current value.
const getMaxActiveStocks = () => {
  const value = process.env.MAX_ACTIVE_STOCKS?.trim();

  if (!value) {
    return DEFAULT_MAX_ACTIVE_STOCKS;
  }

  const max = Number(value);

  if (!Number.isInteger(max) || max < 1) {
    throw new Error("MAX_ACTIVE_STOCKS must be a positive whole number");
  }

  return max;
};

module.exports = {
  DEFAULT_MAX_ACTIVE_STOCKS,
  getMaxActiveStocks,
};
