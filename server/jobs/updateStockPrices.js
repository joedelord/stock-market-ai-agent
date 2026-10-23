const { setTimeout: wait } = require("timers/promises");

const stockModel = require("../models/stockModel");
const marketDataService = require("../services/marketDataService");
const alertService = require("../services/alertService");

const INTERVAL = "15min";
const OUTPUT_SIZE = 5;
const REQUEST_DELAY_MS = 8000;
// The day change barely moves within an hour, and each quote costs an API
// credit, so a stored quote is reused until it is this old.
const QUOTE_MAX_AGE_MS = 60 * 60 * 1000;

const isQuoteFresh = (quote) =>
  Boolean(quote) &&
  Date.now() - new Date(quote.fetched_at).getTime() < QUOTE_MAX_AGE_MS;

// exchanges is optional: manual updates process tracked active stocks on every exchange.

const updateStockPrices = async ({
  delayMs = REQUEST_DELAY_MS,
  signal,
  exchanges,
} = {}) => {
  if (signal?.aborted) return [];

  const stocks = await stockModel.getTrackedStocks();

  const activeStocks = stocks.filter(
    (stock) =>
      stock.is_active && (!exchanges || exchanges.includes(stock.exchange)),
  );

  const results = [];
  let hasRequested = false;

  const beforeRequest = async () => {
    if (hasRequested) {
      await wait(delayMs, undefined, { signal });
    }

    signal?.throwIfAborted();
    hasRequested = true;
  };

  for (const stock of activeStocks) {
    if (signal?.aborted) break;

    const result = {
      symbol: stock.symbol,
      exchange: stock.exchange,
      status: "success",
      saved: 0,
      quoteSaved: false,
    };

    try {
      await beforeRequest();

      const data = await marketDataService.fetchStockPrices({
        symbol: stock.symbol,
        exchange: stock.exchange,
        interval: INTERVAL,
        outputSize: OUTPUT_SIZE,
        signal,
      });

      // Persist a response already received, even if cancellation follows.
      result.saved = await stockModel.saveStockPrices(
        stock.id,
        data.interval,
        data.prices,
      );
    } catch (error) {
      if (signal?.aborted) break;

      result.status = "error";
      result.error = error.message;
    }

    if (signal?.aborted) {
      results.push(result);
      break;
    }

    try {
      const storedQuote = await stockModel.getStockQuote(stock.id);

      if (isQuoteFresh(storedQuote)) {
        result.quoteSkipped = true;
      } else {
        await beforeRequest();

        const quote = await marketDataService.fetchStockQuote({
          symbol: stock.symbol,
          exchange: stock.exchange,
          signal,
        });

        const savedQuote = await stockModel.saveStockQuote(stock.id, quote);

        result.quoteSaved = Boolean(savedQuote);
      }
    } catch (error) {
      if (signal?.aborted) {
        results.push(result);
        break;
      }

      result.quoteError = error.message;
    }

    // Runs even when this run's fetches failed, since stored prices may
    // still meet a newly created alert. Alert errors don't fail the update.
    try {
      const notifications = await alertService.checkStockAlerts(stock);

      result.alertsTriggered = notifications.length;
    } catch (error) {
      result.alertError = error.message;
    }

    results.push(result);
  }

  return results;
};

module.exports = { updateStockPrices };
