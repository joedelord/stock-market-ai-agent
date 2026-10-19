function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function formatPrice(value, currency) {
  const number = toNumber(value);

  if (number === null) return "—";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(number);
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  }).format(date);
}

function StockList({
  stocks,
  pricesByStockId = {},
  selectedStockId,
  onSelectStock,
}) {
  if (stocks.length === 0) {
    return (
      <p className="p-6 text-gray-500">No tracked stocks yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Stocks. The change is compared with the previous stored price.
          Select a stock to see its chart.
        </caption>

        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              Stock
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Price
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Change
            </th>
            <th scope="col" className="px-4 py-3">
              Price time (Helsinki)
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {stocks.map((stock) => {
            const prices = pricesByStockId[stock.id] ?? [];
            const latest = prices.at(-1);

            // Compare prices from the same interval.
            const previous = latest
              ? prices
                  .slice(0, -1)
                  .findLast(
                    (price) => price.interval_code === latest.interval_code,
                  )
              : undefined;

            const latestClose = toNumber(latest?.close);
            const previousClose = toNumber(previous?.close);

            const change =
              latestClose !== null &&
              previousClose !== null &&
              previousClose > 0
                ? ((latestClose - previousClose) / previousClose) * 100
                : null;

            const selected = selectedStockId === stock.id;

            const changeColor =
              change === null || change === 0
                ? "text-gray-500"
                : change > 0
                  ? "text-green-700"
                  : "text-red-700";

            return (
              <tr
                key={stock.id}
                className={selected ? "bg-blue-50" : "hover:bg-gray-50"}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectStock(stock.id)}
                    aria-pressed={selected}
                    className="rounded text-left focus-visible:outline-2 focus-visible:outline-blue-600"
                  >
                    <span className="block font-semibold text-gray-900">
                      {stock.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {stock.symbol} · {stock.exchange}
                    </span>
                  </button>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {formatPrice(latest?.close, stock.currency)}
                </td>

                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${changeColor}`}
                >
                  {change === null
                    ? "—"
                    : `${change > 0 ? "+" : ""}${change.toLocaleString(
                        "en-GB",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )} %`}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                  {formatTime(latest?.price_time)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default StockList;
