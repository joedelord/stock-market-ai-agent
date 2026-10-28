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
            A summary of stored price movements and moving averages. Company news is checked for significant day movements when configured.
            Company financial statements are not included.
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
          Generating analysis... Large day moves also check recent company
          news, which can take a few extra seconds.
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
          {result.metrics.dayMovement ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
              <p>
                <strong>Day change: </strong>
                {result.metrics.dayMovement.changePercent > 0 ? "+" : ""}
                {result.metrics.dayMovement.changePercent.toFixed(2)}%
                {" vs previous session close"}
              </p>
              <p>
                {result.metrics.dayMovement.isSignificant
                  ? "Significant movement"
                  : "Below significant movement threshold"}
                {" (absolute change ≥ "}
                {result.metrics.dayMovement.thresholdPercent.toFixed(2)}%
                {result.metrics.dayMovement.thresholdMethod === "volatility"
                  ? `, twice the typical daily move of ${result.metrics.dayMovement.volatilityPercent.toFixed(2)}% over ${result.metrics.dayMovement.volatilityReturnCount} days)`
                  : ", fixed threshold: too little daily history to measure volatility)"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Stored quote: {formatTime(result.metrics.dayMovement.priceTime)}
                {" (Helsinki time). May differ from the price history period."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Day change unavailable: no valid stored quote.</p>
          )}

          <p className="whitespace-pre-wrap wrap-break-word leading-relaxed text-gray-800">
            {result.analysis.text}
          </p>

          {result.news && (
            <div className="space-y-2 border-t border-gray-100 pt-4 text-sm">
              <h3 className="font-semibold">Recent company news</h3>
              {result.news.windowStart && (
                <p className="text-xs text-gray-500">
                  {formatTime(result.news.windowStart)} – {formatTime(result.news.windowEnd)}
                  {" (Helsinki time; 72 hours ending at the stored quote)"}
                </p>
              )}
              {result.news.status === "available" ? (
                <ol className="list-inside list-decimal space-y-2">
                  {result.news.articles.map((article) => (
                    <li key={article.url}>
                      <a className="text-blue-700 underline" href={article.url} target="_blank" rel="noopener noreferrer">
                        {article.title}
                      </a>
                      <p className="text-xs text-gray-500">
                        {article.source} · {formatTime(article.publishedAt)} (Helsinki time)
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-gray-500">
                  {{
                    not_requested: "News not requested: no significant day movement or no valid quote.",
                    not_configured: "Company news is not configured.",
                    unsupported: "Company news coverage could not be verified for this listing.",
                    unavailable: "Company news is temporarily unavailable. Price analysis is still available.",
                    no_results: "No matching articles were returned for this window. A cause could not be verified.",
                  }[result.news.status] ?? "Company news is unavailable."}
                </p>
              )}
            </div>
          )}

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
                {result.cached && " · reused, because the price data and news have not changed since"}
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
