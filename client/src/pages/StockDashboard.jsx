import { useEffect, useState } from "react";
import { Link } from "react-router";

import StockList from "../components/StockList";
import StockChart from "../components/StockChart";
import StockAnalysis from "../components/StockAnalysis";
import { getErrorMessage } from "../services/errors";
import { getStocks, getStockPrices } from "../services/stockService";

const PRICE_LIMIT = 100;

function StockDashboard() {
  const [stocks, setStocks] = useState([]);
  const [pricesByStockId, setPricesByStockId] = useState({});
  const [priceErrors, setPriceErrors] = useState({});
  const [selectedStockId, setSelectedStockId] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function loadStocks() {
      try {
        const stockList = await getStocks({ signal });

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

        results.forEach((result, index) => {
          const stockId = stockList[index].id;

          if (result.status === "fulfilled") {
            // Sort by time so the list and chart don't depend on the order
            // the server returns.
            nextPrices[stockId] = [...result.value.prices].sort(
              (a, b) => new Date(a.price_time) - new Date(b.price_time),
            );
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

  const selectedStock =
    stocks.find((stock) => stock.id === selectedStockId) ?? null;

  const failedStocks = stocks.filter((stock) => priceErrors[stock.id]);

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/dashboard"
              className="text-sm text-blue-700 underline hover:text-blue-900"
            >
              ← Back to dashboard
            </Link>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">Stocks</h1>

            <p className="mt-2 text-sm text-gray-600">
              Tracked stocks and their stored price history.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </header>

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

            <section aria-labelledby="stock-list-heading">
              <h2
                id="stock-list-heading"
                className="mb-3 text-xl font-semibold text-gray-900"
              >
                Stocks
              </h2>

              <StockList
                stocks={stocks}
                pricesByStockId={pricesByStockId}
                selectedStockId={selectedStockId}
                onSelectStock={setSelectedStockId}
              />

              <p className="mt-2 text-xs text-gray-500">
                The change compares the two latest prices with the same
                interval. Select a stock name to open its chart.
              </p>
            </section>

            {selectedStock && (
              <>
                <StockChart
                  stock={selectedStock}
                  prices={pricesByStockId[selectedStockId] ?? []}
                  errorMessage={priceErrors[selectedStockId] ?? ""}
                />

                <StockAnalysis key={selectedStock.id} stock={selectedStock} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default StockDashboard;
