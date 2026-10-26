import { useId } from "react";

const WIDTH = 800;
const HEIGHT = 300;
const PADDING = { top: 20, right: 24, bottom: 45, left: 85 };

// Same as EXCHANGE_TIME_ZONES in server/config/exchangeMapping.js, so the
// chart's trading day matches the one daily alerts use.
const EXCHANGE_TIME_ZONES = {
  XHEL: "Europe/Helsinki",
  XNAS: "America/New_York",
  XNYS: "America/New_York",
};

function formatPrice(value, currency) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(value);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Helsinki",
  }).format(value);
}

function StockChart({
  stock,
  prices = [],
  isLoading = false,
  errorMessage = "",
}) {
  const titleId = useId();

  if (!stock) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Select a stock to see its price chart.</p>
      </div>
    );
  }

  const sortedPrices = prices
    .filter((price) => Number.isFinite(new Date(price.price_time).getTime()))
    .slice()
    .sort((a, b) => new Date(a.price_time) - new Date(b.price_time));

  const interval = sortedPrices.at(-1)?.interval_code;

  const allPoints = sortedPrices
    .filter((price) => price.interval_code === interval)
    .map((price) => ({
      time: new Date(price.price_time).getTime(),
      close:
        price.close === null || price.close === undefined || price.close === ""
          ? NaN
          : Number(price.close),
    }))
    .filter((point) => Number.isFinite(point.close));

  // Show only the latest trading day: today once it has prices, otherwise
  // the previous trading day.
  const timeZone = EXCHANGE_TIME_ZONES[stock.exchange] ?? "UTC";
  const marketDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone });
  const marketDate = allPoints.length
    ? marketDateFormat.format(allPoints.at(-1).time)
    : null;
  const points = allPoints.filter(
    (point) => marketDateFormat.format(point.time) === marketDate,
  );
  const tradingDay = points.length
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeZone }).format(
        points.at(-1).time,
      )
    : "";

  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const values = points.map((point) => point.close);
  const min = points.length ? Math.min(...values) : 0;
  const max = points.length ? Math.max(...values) : 0;
  const margin = (max - min) * 0.1 || Math.abs(max) * 0.01 || 1;

  const yMin = min - margin;
  const yMax = max + margin;

  const firstTime = points[0]?.time ?? 0;
  const lastTime = points.at(-1)?.time ?? firstTime;

  const getX = (time) =>
    firstTime === lastTime
      ? PADDING.left + chartWidth / 2
      : PADDING.left +
        ((time - firstTime) / (lastTime - firstTime)) * chartWidth;

  const getY = (value) =>
    PADDING.top + ((yMax - value) / (yMax - yMin)) * chartHeight;

  const line = points
    .map((point) => `${getX(point.time)},${getY(point.close)}`)
    .join(" ");

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={isLoading}
      className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
    >
      <h2 id={titleId} className="text-xl font-bold text-gray-900">
        {stock.name}
      </h2>

      <p className="mt-1 text-sm text-gray-500">
        {stock.symbol} · {stock.exchange} · {stock.currency}
      </p>

      {isLoading ? (
        <p role="status" className="py-12 text-center text-gray-500">
          Loading price history...
        </p>
      ) : errorMessage ? (
        <p role="alert" className="py-12 text-center text-red-700">
          {errorMessage}
        </p>
      ) : points.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          No price history for this stock yet.
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-label={`${stock.name}: ${points.length} price points.
                First ${formatPrice(points[0].close, stock.currency)},
                latest ${formatPrice(points.at(-1).close, stock.currency)}.`}
              className="block w-full min-w-140"
            >
              {[0, 1, 2, 3, 4].map((index) => {
                const value = yMax - ((yMax - yMin) * index) / 4;
                const y = getY(value);

                return (
                  <g key={index}>
                    <line
                      x1={PADDING.left}
                      x2={WIDTH - PADDING.right}
                      y1={y}
                      y2={y}
                      stroke="#e5e7eb"
                    />
                    <text
                      x={PADDING.left - 10}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize="12"
                      fill="#6b7280"
                    >
                      {value.toLocaleString("en-GB", {
                        maximumFractionDigits: 2,
                      })}
                    </text>
                  </g>
                );
              })}

              <polyline
                points={line}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {points.length === 1 && (
                <circle
                  cx={getX(points[0].time)}
                  cy={getY(points[0].close)}
                  r="4"
                  fill="#2563eb"
                />
              )}

              <text
                x={PADDING.left}
                y={HEIGHT - 12}
                fontSize="12"
                fill="#6b7280"
              >
                {formatTime(firstTime)}
              </text>

              {points.length > 1 && (
                <text
                  x={WIDTH - PADDING.right}
                  y={HEIGHT - 12}
                  textAnchor="end"
                  fontSize="12"
                  fill="#6b7280"
                >
                  {formatTime(lastTime)}
                </text>
              )}
            </svg>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Closing prices on trading day {tradingDay}
            {interval ? ` · Interval: ${interval}` : ""}
            {" · Times in Helsinki time"}
          </p>
        </>
      )}
    </section>
  );
}

export default StockChart;
