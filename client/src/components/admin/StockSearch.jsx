import { useEffect, useRef, useState } from "react";

import { createStock, searchProviderStocks } from "../../services/stockService";
import { getErrorMessage } from "../../services/errors";

const toKey = (stock) => `${stock.symbol}:${stock.exchange}`;

function StockSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const [addingKey, setAddingKey] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const searchController = useRef(null);

  useEffect(() => () => searchController.current?.abort(), []);

  const handleSearch = async (event) => {
    event.preventDefault();

    // Only the latest search may update the results.
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;

    setIsSearching(true);
    setErrorMessage("");

    try {
      const found = await searchProviderStocks(query.trim(), {
        signal: controller.signal,
      });

      setResults(found);
      setAddedKeys(new Set());
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(getErrorMessage(error, "Failed to search stocks"));
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  };

  const handleAdd = async (result) => {
    const key = toKey(result);

    setAddingKey(key);
    setErrorMessage("");

    try {
      await createStock({
        symbol: result.symbol,
        exchange: result.exchange,
        name: result.name,
        currency: result.currency,
      });

      setAddedKeys((current) => new Set(current).add(key));
    } catch (error) {
      // Someone else added it after the search, so it is in the database.
      if (error.response?.status === 409) {
        setAddedKeys((current) => new Set(current).add(key));
      } else {
        setErrorMessage(getErrorMessage(error, "Failed to add stock"));
      }
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <section className="mt-12 text-left">
      <h2 className="mb-4 text-2xl font-bold">Add stocks</h2>

      <form onSubmit={handleSearch} className="mb-4 flex gap-3">
        <input
          type="search"
          aria-label="Search Twelve Data"
          placeholder="Symbol or company name"
          value={query}
          required
          maxLength={50}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1 rounded border px-3 py-2"
        />

        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </form>

      {errorMessage && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-red-700">
          {errorMessage}
        </p>
      )}

      {results?.length === 0 && (
        <p className="text-gray-600">
          No stocks found on supported exchanges.
        </p>
      )}

      {results?.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2 pr-3">Symbol</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Exchange</th>
              <th className="py-2 pr-3">Currency</th>
              <th className="py-2">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {results.map((result) => {
              const key = toKey(result);
              const isAdded = result.stockId !== null || addedKeys.has(key);

              return (
                <tr key={key} className="border-b">
                  <td className="py-2 pr-3 font-medium">{result.symbol}</td>
                  <td className="py-2 pr-3">{result.name}</td>
                  <td className="py-2 pr-3">{result.exchange}</td>
                  <td className="py-2 pr-3">{result.currency}</td>
                  <td className="py-2 text-right">
                    {isAdded ? (
                      <span className="rounded bg-green-50 px-2 py-1 text-green-700">
                        Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAdd(result)}
                        disabled={addingKey !== null}
                        aria-label={`Add ${result.symbol} on ${result.exchange}`}
                        className="rounded border border-gray-300 px-3 py-1 font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        {addingKey === key ? "Adding..." : "Add"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default StockSearch;
