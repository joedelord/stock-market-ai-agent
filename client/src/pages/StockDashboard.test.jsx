import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import StockDashboard from "./StockDashboard";
import { mockApi, restoreApi } from "../test/mockApi";

const stocks = [
  {
    id: 1,
    symbol: "AAPL",
    exchange: "XNAS",
    name: "Apple",
    currency: "USD",
    is_active: true,
  },
  {
    id: 2,
    symbol: "MSFT",
    exchange: "XNAS",
    name: "Microsoft",
    currency: "USD",
    is_active: true,
  },
];

// Oldest first, as the server returns them.
function createPrices(previous, latest) {
  return [
    {
      price_time: "2026-10-19T13:30:00.000Z",
      interval_code: "15min",
      close: String(previous),
    },
    {
      price_time: "2026-10-19T13:45:00.000Z",
      interval_code: "15min",
      close: String(latest),
    },
  ];
}

function createRoutes(overrides = {}) {
  return {
    "GET /me/stocks": () => [200, { stocks }],
    "GET /stocks": () => [200, { stocks }],

    "GET /stocks/1/prices": () => [
      200,
      {
        stock: stocks[0],
        prices: createPrices(100, 110),
      },
    ],

    "GET /stocks/2/prices": () => [
      200,
      {
        stock: stocks[1],
        prices: createPrices(200, 190),
      },
    ],

    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <StockDashboard />
    </MemoryRouter>,
  );
}

afterEach(() => {
  restoreApi();
});

describe("StockDashboard", () => {
  it("loads stocks, prices and the first stock's chart", async () => {
    mockApi(createRoutes());

    renderDashboard();

    const table = await screen.findByRole("table");
    const appleRow = within(table).getByRole("row", { name: /^Apple/ });
    const microsoftRow = within(table).getByRole("row", {
      name: /^Microsoft/,
    });

    expect(within(appleRow).getByText("US$110.00")).toBeInTheDocument();
    expect(within(appleRow).getByText("+10.00 %")).toBeInTheDocument();

    expect(within(microsoftRow).getByText("US$190.00")).toBeInTheDocument();
    expect(within(microsoftRow).getByText("-5.00 %")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^Apple/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(
      screen.getByRole("img", { name: /Apple: 2 price points/ }),
    ).toBeInTheDocument();
  });

  it("changes the chart when another stock is selected", async () => {
    const user = userEvent.setup();
    const requests = mockApi(createRoutes());

    renderDashboard();

    const microsoftButton = await screen.findByRole("button", {
      name: /^Microsoft/,
    });

    const requestCount = requests.length;

    await user.click(microsoftButton);

    expect(microsoftButton).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByRole("button", { name: /^Apple/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    expect(
      screen.getByRole("img", { name: /Microsoft: 2 price points/ }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("img", { name: /Apple: 2 price points/ }),
    ).not.toBeInTheDocument();

    // Switching stocks uses prices that have already been loaded.
    expect(requests).toHaveLength(requestCount);
  });

  it("shows an error when loading the stock list fails", async () => {
    mockApi(
      createRoutes({
        "GET /me/stocks": () => [500, { error: "Internal server error" }],
      }),
    );

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Internal server error",
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("keeps other stocks available when one price request fails", async () => {
    const user = userEvent.setup();

    mockApi(
      createRoutes({
        "GET /stocks/2/prices": () => [503, { error: "Service unavailable" }],
      }),
    );

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent("MSFT (XNAS)");

    expect(
      screen.getByRole("img", { name: /Apple: 2 price points/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Microsoft/ }));

    expect(screen.getByText("Service unavailable")).toBeInTheDocument();

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("fetches updated prices when refresh is clicked", async () => {
    const user = userEvent.setup();
    let applePriceRequests = 0;

    const requests = mockApi(
      createRoutes({
        "GET /stocks/1/prices": () => {
          applePriceRequests += 1;

          return [
            200,
            {
              stock: stocks[0],
              prices: createPrices(100, applePriceRequests === 1 ? 110 : 120),
            },
          ];
        },
      }),
    );

    renderDashboard();

    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await screen.findByText("US$120.00");

    const table = screen.getByRole("table");
    const appleRow = within(table).getByRole("row", { name: /^Apple/ });

    expect(within(appleRow).getByText("US$120.00")).toBeInTheDocument();
    expect(within(appleRow).getByText("+20.00 %")).toBeInTheDocument();

    for (const route of [
      "GET /me/stocks",
      "GET /stocks/1/prices",
      "GET /stocks/2/prices",
    ]) {
      expect(
        requests.filter((request) => request.route === route),
      ).toHaveLength(2);
    }
  });

  it("keeps the AI analysis when prices are refreshed", async () => {
    const user = userEvent.setup();

    mockApi(
      createRoutes({
        "POST /stocks/1/analysis": () => [
          200,
          {
            stock: stocks[0],
            metrics: {
              interval: "15min",
              pointCount: 2,
              periodStart: "2026-10-19T13:30:00.000Z",
              periodEnd: "2026-10-19T13:45:00.000Z",
            },
            analysis: {
              text: "Apple rose over the period.",
              model: "test-model",
              generatedAt: "2026-10-19T14:00:00.000Z",
            },
          },
        ],
      }),
    );

    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Analyze" }));
    await screen.findByText("Apple rose over the period.");

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("button", { name: "Refresh" }),
    ).toBeEnabled();
    expect(screen.getByText("Apple rose over the period.")).toBeInTheDocument();
  });

  it("keeps the loaded stocks when a refresh fails", async () => {
    const user = userEvent.setup();
    let stockRequests = 0;

    mockApi(
      createRoutes({
        "GET /me/stocks": () => {
          stockRequests += 1;

          return stockRequests === 1
            ? [200, { stocks }]
            : [500, { error: "Internal server error" }];
        },
      }),
    );

    renderDashboard();

    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Internal server error",
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows the day change from the stored quote", async () => {
    mockApi(
      createRoutes({
        "GET /stocks/1/prices": () => [
          200,
          {
            stock: stocks[0],
            prices: createPrices(100, 110),
            quote: {
              price_time: "2026-10-19T13:45:00.000Z",
              close: "102.500000",
              previous_close: "100.000000",
              day_change_percent: "2.5000000000000000",
            },
          },
        ],
        "GET /stocks/2/prices": () => [
          200,
          {
            stock: stocks[1],
            prices: createPrices(200, 190),
            quote: {
              price_time: "2026-10-19T13:45:00.000Z",
              close: "196.000000",
              previous_close: "200.000000",
              day_change_percent: "-2.0000000000000000",
            },
          },
        ],
      }),
    );

    renderDashboard();

    const table = await screen.findByRole("table");
    const appleRow = within(table).getByRole("row", { name: /^Apple/ });
    const microsoftRow = within(table).getByRole("row", {
      name: /^Microsoft/,
    });

    const appleDayChange = within(appleRow).getByText("+2.50 %");

    expect(appleDayChange).toHaveClass("text-green-700");
    expect(appleDayChange).toHaveTextContent("US$102.50 · 19/10/2026, 16:45");

    expect(within(microsoftRow).getByText("-2.00 %")).toHaveClass(
      "text-red-700",
    );
  });

  it("shows a dash when a stock has no quote yet", async () => {
    mockApi(createRoutes());

    renderDashboard();

    const table = await screen.findByRole("table");
    const appleRow = within(table).getByRole("row", { name: /^Apple/ });

    expect(within(appleRow).getByText("—")).toHaveClass("text-gray-500");
  });

  it("shows an empty state when there are no stocks", async () => {
    mockApi(
      createRoutes({
        "GET /me/stocks": () => [200, { stocks: [] }],
      }),
    );

    renderDashboard();

    expect(
      await screen.findByText(
        "No tracked stocks yet. Add your first stock above.",
      ),
    ).toBeInTheDocument();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows an empty chart when the stock has no price history", async () => {
    mockApi(
      createRoutes({
        "GET /stocks/1/prices": () => [200, { stock: stocks[0], prices: [] }],
      }),
    );

    renderDashboard();

    expect(
      await screen.findByText("No price history for this stock yet."),
    ).toBeInTheDocument();

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("searches the catalog and follows a stock into an empty watchlist", async () => {
    const user = userEvent.setup();

    const requests = mockApi(
      createRoutes({
        "GET /me/stocks": () => [200, { stocks: [] }],
        "POST /me/stocks": () => [201, { stock: stocks[0] }],
      }),
    );

    renderDashboard();

    await screen.findByText("No tracked stocks yet. Add your first stock above.");

    await user.type(screen.getByRole("searchbox"), "aapl");

    expect(
      screen.queryByRole("button", { name: "Follow Microsoft (XNAS)" }),
    ).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: "Follow Apple (XNAS)" }),
    );

    const table = await screen.findByRole("table");
    const appleRow = within(table).getByRole("row", { name: /^Apple/ });

    expect(await within(appleRow).findByText("US$110.00")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Unfollow Apple (XNAS)" }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Follow Apple (XNAS)" }),
    ).not.toBeInTheDocument();

    expect(
      requests.find((request) => request.route === "POST /me/stocks").body,
    ).toEqual({ stockId: 1 });

    // Following loads only the new stock's prices, not the whole watchlist.
    expect(
      requests.filter((request) => request.route === "GET /me/stocks"),
    ).toHaveLength(1);
  });

  it("unfollows the selected stock and selects the remaining stock", async () => {
    const user = userEvent.setup();

    mockApi(
      createRoutes({
        "DELETE /me/stocks/1": () => [204],
      }),
    );

    renderDashboard();

    await user.click(
      await screen.findByRole("button", { name: "Unfollow Apple (XNAS)" }),
    );

    expect(
      await screen.findByRole("button", { name: /^Microsoft/ }),
    ).toHaveAttribute("aria-pressed", "true");

    expect(
      screen.queryByRole("button", { name: "Unfollow Apple (XNAS)" }),
    ).not.toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "Follow Apple (XNAS)" }),
    ).toBeEnabled();
  });

  it("keeps the followed stock and shows an error when unfollowing fails", async () => {
    const user = userEvent.setup();

    mockApi(
      createRoutes({
        "DELETE /me/stocks/1": () => [500, { error: "Could not remove stock" }],
      }),
    );

    renderDashboard();

    await user.click(
      await screen.findByRole("button", { name: "Unfollow Apple (XNAS)" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not remove stock",
    );

    expect(
      screen.getByRole("button", { name: "Unfollow Apple (XNAS)" }),
    ).toBeEnabled();

    expect(
      screen.getByRole("img", { name: /Apple: 2 price points/ }),
    ).toBeInTheDocument();
  });
});
