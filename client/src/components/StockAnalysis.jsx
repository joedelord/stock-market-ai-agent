import { useEffect, useId, useRef, useState } from "react";

import { createStockAnalysis } from "../services/stockService";
import { getErrorMessage } from "../services/errors";

const INTERVAL_LABELS = {
  "1min": "1-minute",
  "5min": "5-minute",
  "15min": "15-minute",
  "30min": "30-minute",
  "1h": "1-hour",
  "1day": "daily",
};

function formatInterval(interval) {
  return INTERVAL_LABELS[interval] ?? interval;
}

function formatTime(value) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  }).format(date);
}

// The parent uses key={stock.id} to reset state when the stock changes.
function StockAnalysis({ stock }) {
  const headingId = useId();
  const requestRef = useRef(null);

  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  async function handleAnalyze() {
    // Also prevents duplicate requests before React updates the button.
    if (requestRef.current || !stock.is_active) return;

    const controller = new AbortController();
    requestRef.current = controller;

    // The previous result stays visible until a new one replaces it.
    setIsLoading(true);
    setErrorMessage("");

    try {
      const data = await createStockAnalysis(stock.id, {
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setResult(data);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(getErrorMessage(error, "Failed to generate analysis."));
      }
    } finally {
      if (!controller.signal.aborted) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={isLoading}
      className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold text-gray-900">
            AI analysis · {stock.symbol}
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            A summary of stored price movements and moving averages. News and
            company financials are not included.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isLoading || !stock.is_active}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Analyzing..." : result ? "Analyze again" : "Analyze"}
        </button>
      </div>

      {!stock.is_active && (
        <p className="mt-4 text-sm text-gray-500">
          Analysis is unavailable for inactive stocks.
        </p>
      )}

      {isLoading && (
        <p role="status" className="mt-6 text-sm text-gray-500">
          Generating analysis...
        </p>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {errorMessage}
        </p>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <p className="whitespace-pre-wrap wrap-break-word leading-relaxed text-gray-800">
            {result.analysis.text}
          </p>

          <dl className="space-y-1 border-t border-gray-100 pt-4 text-xs text-gray-500">
            <div>
              <dt className="inline font-semibold">Data period: </dt>
              <dd className="inline">
                {formatTime(result.metrics.periodStart)}
                {" – "}
                {formatTime(result.metrics.periodEnd)}
                {" (Helsinki time)"}
              </dd>
            </div>

            <div>
              <dt className="inline font-semibold">Data: </dt>
              <dd className="inline">
                {result.metrics.pointCount}{" "}
                {formatInterval(result.metrics.interval)} price points
              </dd>
            </div>

            <div>
              <dt className="inline font-semibold">Generated: </dt>
              <dd className="inline">
                {formatTime(result.analysis.generatedAt)}
                {" (Helsinki time)"}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-gray-500">
            AI-generated summary of historical data. It may contain errors and
            is not investment advice.
          </p>
        </div>
      )}
    </section>
  );
}

export default StockAnalysis;
