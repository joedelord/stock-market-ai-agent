import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import StockChart from "./StockChart";

const stock = {
  id: "1",
  name: "Apple",
  symbol: "AAPL",
  exchange: "XNAS",
  currency: "USD",
};

function price(priceTime, close) {
  return { price_time: priceTime, interval_code: "15min", close };
}

it("charts only the latest trading day in the exchange's time zone", () => {
  render(
    <StockChart
      stock={stock}
      prices={[
        price("2026-10-19T19:45:00.000Z", "99"),
        // 00:15 UTC is still 19 October in New York.
        price("2026-10-20T00:15:00.000Z", "100"),
        price("2026-10-20T13:30:00.000Z", "101"),
        price("2026-10-20T13:45:00.000Z", "102"),
      ]}
    />,
  );

  expect(
    screen.getByRole("img", { name: /Apple: 2 price points/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Closing prices on trading day 20\/10\/2026/),
  ).toBeInTheDocument();
});

it("keeps showing the previous trading day until the new day has prices", () => {
  render(
    <StockChart
      stock={stock}
      prices={[
        price("2026-10-19T13:30:00.000Z", "99"),
        price("2026-10-19T19:45:00.000Z", "100"),
      ]}
    />,
  );

  expect(
    screen.getByRole("img", { name: /Apple: 2 price points/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Closing prices on trading day 19\/10\/2026/),
  ).toBeInTheDocument();
});
