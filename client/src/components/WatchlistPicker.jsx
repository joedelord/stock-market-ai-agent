import { useEffect, useState } from "react";

import { getStocks } from "../services/stockService";
import { getErrorMessage } from "../services/errors";

// Keeps the list short enough to scan; the search narrows it further.
const MAX_RESULTS = 50;

function WatchlistPicker({ stocks, onAdd, disabled }) {
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function loadCatalog() {
      try {
        const stockList = await getStocks({ signal });

        if (!signal.aborted) {
          setCatalog(stockList);
        }
      } catch (error) {
        if (!signal.aborted) {
          setErrorMessage(
            getErrorMessage(error, "Failed to load available stocks"),
          );
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadCatalog();

    return () => controller.abort();
  }, [reloadCount]);

  const handleRetry = () => {
    setIsLoading(true);
    setErrorMessage("");
    setReloadCount((count) => count + 1);
  };

  const followedIds = new Set(stocks.map((stock) => stock.id));
  const search = query.trim().toLowerCase();

  const matches = catalog.filter(
    (stock) =>
      stock.is_active &&
      !followedIds.has(stock.id) &&
      `${stock.name} ${stock.symbol} ${stock.exchange}`
        .toLowerCase()
        .includes(search),
  );

  return (
    <section
      aria-labelledby="add-stock-heading"
      className="rounded-xl border border-gray-200 bg-white p-4"
    >
      <h2 id="add-stock-heading" className="text-xl font-semibold">
        Add to watchlist
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Search stocks already available in the shared catalog.
      </p>

      <label htmlFor="stock-search" className="mt-3 block text-sm font-medium">
        Search by name, symbol or exchange
      </label>

      <input
        id="stock-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
      />

      {isLoading ? (
        <p role="status" className="mt-3">
          Loading available stocks...
        </p>
      ) : errorMessage ? (
        <div className="mt-3">
          <p role="alert">{errorMessage}</p>

          <button
            type="button"
            onClick={handleRetry}
            className="text-blue-700 underline"
          >
            Retry stock search
          </button>
        </div>
      ) : matches.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          No matching stocks available to add.
        </p>
      ) : (
        <ul className="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto">
          {matches.slice(0, MAX_RESULTS).map((stock) => (
            <li
              key={stock.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span>
                {stock.name}{" "}
                <span className="text-sm text-gray-500">
                  {stock.symbol} · {stock.exchange}
                </span>
              </span>

              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(stock.id)}
                aria-label={`Follow ${stock.name} (${stock.exchange})`}
                className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
              >
                Follow
              </button>
            </li>
          ))}
        </ul>
      )}

      {matches.length > MAX_RESULTS && (
        <p className="mt-2 text-sm text-gray-500">
          Showing the first {MAX_RESULTS} matches. Refine your search to see
          more.
        </p>
      )}
    </section>
  );
}

export default WatchlistPicker;
