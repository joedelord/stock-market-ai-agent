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

function formatChange(value) {
  if (value === null) return "—";

  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

function getChangeColor(value) {
  if (value === null || value === 0) return "text-gray-500";

  return value > 0 ? "text-green-700" : "text-red-700";
}

function StockList({
  stocks,
  pricesByStockId = {},
  selectedStockId,
  onSelectStock,
  quotesByStockId = {},
}) {
  if (stocks.length === 0) {
    return <p className="p-6 text-gray-500">No tracked stocks yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Stocks. The 15 min change compares the two latest stored prices. The
          day change compares the latest quote with the previous trading
          day's close; its quote price and time are shown below it. Select a
          stock to see its chart.
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
              15 min change
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Day change
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
            const quote = quotesByStockId[stock.id] ?? null;
            const dayChange = toNumber(quote?.day_change_percent);

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
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${getChangeColor(change)}`}
                >
                  {formatChange(change)}
                </td>

                <td
                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${getChangeColor(dayChange)}`}
                >
                  {formatChange(dayChange)}

                  {/* Visible rather than a tooltip, so touch and keyboard
                      users can see which quote the change comes from. */}
                  {quote && (
                    <span className="mt-1 block text-xs font-normal text-gray-500">
                      {formatPrice(quote.close, stock.currency)} ·{" "}
                      {formatTime(quote.price_time)}
                    </span>
                  )}
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
