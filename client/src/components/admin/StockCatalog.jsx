import { useEffect, useState } from "react";

import { deleteStock, getStockCatalog } from "../../services/stockService";
import { getErrorMessage } from "../../services/errors";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Removing a stock also removes it from every watchlist and deletes its
// alerts, so the confirmation says how many people it affects.
const confirmMessage = (stock) => {
  const lines = [`Remove ${stock.symbol} (${stock.name}) from the app?`];

  if (stock.follower_count > 0 || stock.active_alert_count > 0) {
    lines.push(
      `It is on ${plural(stock.follower_count, "watchlist")} and has ${plural(stock.active_alert_count, "active alert")}. They will be deleted.`,
    );
  }

  lines.push("Its price history is deleted too. This cannot be undone.");

  return lines.join("\n\n");
};

// reloadKey changes when StockSearch adds a stock.
function StockCatalog({ reloadKey, onStockDeleted }) {
  const [catalog, setCatalog] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    getStockCatalog({ signal: controller.signal })
      .then((data) => {
        setCatalog(data);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setErrorMessage(getErrorMessage(error, "Failed to load stocks"));
        }
      });

    return () => controller.abort();
  }, [reloadKey]);

  const handleDelete = async (stock) => {
    if (!window.confirm(confirmMessage(stock))) {
      return;
    }

    setDeletingId(stock.id);
    setErrorMessage("");

    try {
      await deleteStock(stock.id);

      setCatalog((current) => {
        const stocks = current.stocks.filter((item) => item.id !== stock.id);

        return {
          stocks,
          limit: {
            ...current.limit,
            active: stocks.filter((item) => item.is_active).length,
          },
        };
      });

      onStockDeleted?.(stock);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to remove stock"));
    } finally {
      setDeletingId(null);
    }
  };

  const isFull = catalog && catalog.limit.active >= catalog.limit.max;

  return (
    <section className="mt-12 text-left" aria-labelledby="stock-catalog-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="stock-catalog-title" className="text-2xl font-bold">
          Stocks in the app
        </h2>

        {catalog && (
          <p
            className={`text-sm font-medium ${isFull ? "text-red-700" : "text-gray-600"}`}
          >
            {catalog.limit.active} / {catalog.limit.max} active stocks
          </p>
        )}
      </div>

      <p className="mb-4 text-sm text-gray-600">
        Users can follow these stocks. Each followed stock uses market data
        requests, so the number of active stocks is limited.
        {isFull && " The limit is reached: remove a stock before adding another."}
      </p>

      {errorMessage && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-red-700">
          {errorMessage}
        </p>
      )}

      {!catalog && !errorMessage && (
        <p className="text-gray-600">Loading stocks...</p>
      )}

      {catalog?.stocks.length === 0 && (
        <p className="text-gray-600">
          No stocks yet. Add them with the search below.
        </p>
      )}

      {catalog?.stocks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="py-2 pr-3">Symbol</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Exchange</th>
                <th className="py-2 pr-3 text-right">Followers</th>
                <th className="py-2 pr-3 text-right">Active alerts</th>
                <th className="py-2">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {catalog.stocks.map((stock) => (
                <tr key={stock.id} className="border-b">
                  <td className="py-2 pr-3 font-medium">
                    {stock.symbol}
                    {!stock.is_active && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        (inactive)
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{stock.name}</td>
                  <td className="py-2 pr-3">{stock.exchange}</td>
                  <td className="py-2 pr-3 text-right">{stock.follower_count}</td>
                  <td className="py-2 pr-3 text-right">
                    {stock.active_alert_count}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(stock)}
                      disabled={deletingId !== null}
                      aria-label={`Remove ${stock.symbol} on ${stock.exchange}`}
                      className="rounded border border-red-300 px-3 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === stock.id ? "Removing..." : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default StockCatalog;
