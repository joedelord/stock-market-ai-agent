import { useEffect, useState } from "react";
import { Link } from "react-router";

import StockList from "../components/StockList";
import StockChart from "../components/StockChart";
import StockAnalysis from "../components/StockAnalysis";
import WatchlistPicker from "../components/WatchlistPicker";
import { getErrorMessage } from "../services/errors";
import {
  getWatchlistStocks,
  getStockPrices,
  createWatchlistStock,
  deleteWatchlistStock,
} from "../services/stockService";

const PRICE_LIMIT = 100;

// Sort by time so the list and chart don't depend on the order the server
// returns.
function sortByTime(prices) {
  return [...prices].sort(
    (a, b) => new Date(a.price_time) - new Date(b.price_time),
  );
}

function StockDashboard() {
  const [stocks, setStocks] = useState([]);
  const [pricesByStockId, setPricesByStockId] = useState({});
  const [priceErrors, setPriceErrors] = useState({});
  const [selectedStockId, setSelectedStockId] = useState(null);
  const [quotesByStockId, setQuotesByStockId] = useState({});

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [watchlistError, setWatchlistError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function loadStocks() {
      try {
        const stockList = await getWatchlistStocks({ signal });

        const results = await Promise.allSettled(
          stockList.map((stock) =>
            getStockPrices(stock.id, {
              limit: PRICE_LIMIT,
              signal,
            }),
          ),
        );

        if (signal.aborted) return;

        const nextPrices = {};
        const nextErrors = {};
        const nextQuotes = {};

        results.forEach((result, index) => {
          const stockId = stockList[index].id;

          if (result.status === "fulfilled") {
            nextPrices[stockId] = sortByTime(result.value.prices);

            nextQuotes[stockId] = result.value.quote ?? null;
          } else {
            nextErrors[stockId] = getErrorMessage(
              result.reason,
              "Failed to load prices",
            );
          }
        });

        setStocks(stockList);
        setPricesByStockId(nextPrices);
        setPriceErrors(nextErrors);
        setQuotesByStockId(nextQuotes);

        setSelectedStockId((currentId) =>
          stockList.some((stock) => stock.id === currentId)
            ? currentId
            : (stockList[0]?.id ?? null),
        );

        setLoadedAt(new Date());
      } catch (error) {
        if (!signal.aborted) {
          setErrorMessage(getErrorMessage(error, "Failed to load stocks"));
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadStocks();

    return () => controller.abort();
  }, [reloadCount]);

  const handleRefresh = () => {
    setIsLoading(true);
    setErrorMessage("");
    setReloadCount((count) => count + 1);
  };

  // Only the new stock's prices are loaded, so a follow doesn't reload
  // every stock or reset a running analysis.
  const loadPricesForStock = async (stockId) => {
    try {
      const { prices, quote } = await getStockPrices(stockId, {
        limit: PRICE_LIMIT,
      });

      setPricesByStockId((current) => ({
        ...current,
        [stockId]: sortByTime(prices),
      }));

      setQuotesByStockId((current) => ({
        ...current,
        [stockId]: quote ?? null,
      }));

      setPriceErrors((current) => {
        const next = { ...current };
        delete next[stockId];

        return next;
      });
    } catch (error) {
      setPriceErrors((current) => ({
        ...current,
        [stockId]: getErrorMessage(error, "Failed to load prices"),
      }));
    }
  };

  const handleAddStock = async (stockId) => {
    setIsSaving(true);
    setWatchlistError("");

    try {
      const stock = await createWatchlistStock(stockId);

      setStocks((current) =>
        current.some((item) => item.id === stock.id)
          ? current
          : [...current, stock].sort((a, b) => a.name.localeCompare(b.name)),
      );

      setSelectedStockId((currentId) => currentId ?? stock.id);

      await loadPricesForStock(stock.id);
    } catch (error) {
      setWatchlistError(getErrorMessage(error, "Failed to follow stock"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveStock = async (stockId) => {
    setIsSaving(true);
    setWatchlistError("");

    try {
      await deleteWatchlistStock(stockId);

      // The buttons are disabled while saving, so stocks can't change
      // between the click and this update.
      const remaining = stocks.filter((stock) => stock.id !== stockId);

      setStocks(remaining);

      setSelectedStockId((currentId) =>
        currentId === stockId ? (remaining[0]?.id ?? null) : currentId,
      );
    } catch (error) {
      setWatchlistError(getErrorMessage(error, "Failed to unfollow stock"));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedStock =
    stocks.find((stock) => stock.id === selectedStockId) ?? null;

  const failedStocks = stocks.filter((stock) => priceErrors[stock.id]);

  return (
    <main id="main-content" className="stock-workspace px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="workspace-eyebrow">YOUR WORKSPACE</p>
            <h1 className="mt-3 text-3xl font-bold text-gray-900">
              My watchlist
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Follow the moves. Explore the details. Stay informed.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <Link
              to="/alerts"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-blue-700"
            >
              My alerts
            </Link>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading || isSaving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </header>

        {watchlistError && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {watchlistError}
          </p>
        )}

        {loadedAt && (
          <p className="text-sm text-gray-500">
            Last loaded:{" "}
            {loadedAt.toLocaleString("en-GB", {
              timeZone: "Europe/Helsinki",
            })}
            {" (Helsinki time)"}
          </p>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {errorMessage}
          </p>
        )}

        {/* After the first load, a refresh keeps the current data on screen,
            so a running or finished AI analysis is not thrown away. */}
        {!loadedAt ? (
          isLoading && (
            <p role="status" className="py-12 text-center text-gray-500">
              Loading stocks and prices...
            </p>
          )
        ) : (
          <>
            {failedStocks.length > 0 && (
              <p
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
              >
                Failed to load prices for:{" "}
                {failedStocks
                  .map((stock) => `${stock.symbol} (${stock.exchange})`)
                  .join(", ")}
                . Try refreshing the page.
              </p>
            )}

            <div className="watchlist-layout">
            <section aria-labelledby="stock-list-heading" className="watchlist-panel">
              {/* The picker's panel wraps onto its own line below this row. */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="stock-list-heading"
                  className="text-xl font-semibold text-gray-900"
                >
                  Stocks <span className="stock-count">{stocks.length}</span>
                </h2>

                <WatchlistPicker
                  stocks={stocks}
                  onAdd={handleAddStock}
                  disabled={isLoading || isSaving}
                />
              </div>

              <StockList
                stocks={stocks}
                pricesByStockId={pricesByStockId}
                quotesByStockId={quotesByStockId}
                selectedStockId={selectedStockId}
                onSelectStock={setSelectedStockId}
                onRemoveStock={handleRemoveStock}
                disabled={isLoading || isSaving}
              />

              <p className="mt-2 text-xs text-gray-500">
                15 min change compares the latest stored bars of the same
                interval. Day change uses a separate quote and the previous
                trading day's close. Its quote price and time (Helsinki) are
                shown below the percentage. Select a stock name to open its
                chart.
              </p>
            </section>

            <div className="stock-detail-panel">
            {selectedStock ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="workspace-eyebrow">STOCK OVERVIEW · {selectedStock.symbol}</p>
                  <Link
                    to={`/alerts?stockId=${encodeURIComponent(selectedStock.id)}`}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white"
                  >
                    Create alert for {selectedStock.symbol}
                  </Link>
                </div>
                <StockChart
                  stock={selectedStock}
                  prices={pricesByStockId[selectedStockId] ?? []}
                  errorMessage={priceErrors[selectedStockId] ?? ""}
                />

                <StockAnalysis key={selectedStock.id} stock={selectedStock} />
              </>
            ) : (
              <div className="empty-stock-detail"><span aria-hidden="true">↗</span><h2>Build your market view</h2><p>Add a stock to your watchlist to explore its chart, create alerts and generate an AI analysis.</p></div>
            )}
            </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default StockDashboard;
