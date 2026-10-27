import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import StockSearch from "./StockSearch";
import { mockApi, restoreApi } from "../../test/mockApi";

const apple = {
  symbol: "AAPL",
  exchange: "XNAS",
  name: "Apple Inc",
  currency: "USD",
  country: "United States",
  stockId: null,
};

const nokia = {
  symbol: "NOKIA",
  exchange: "XHEL",
  name: "Nokia Oyj",
  currency: "EUR",
  country: "Finland",
  stockId: "7",
};

async function search(user, text) {
  await user.type(screen.getByLabelText("Search Twelve Data"), text);
  await user.click(screen.getByRole("button", { name: "Search" }));
}

afterEach(restoreApi);

describe("StockSearch", () => {
  test("adds a stock from the search results", async () => {
    const user = userEvent.setup();

    const requests = mockApi({
      "GET /stocks/search": () => [200, { results: [apple, nokia] }],
      "POST /stocks": () => [201, { stock: { id: "8" } }],
    });

    render(<StockSearch />);

    await search(user, "a");

    expect(await screen.findByText("Apple Inc")).toBeInTheDocument();

    // NOKIA is already in the database.
    expect(
      screen.queryByRole("button", { name: "Add NOKIA on XHEL" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Added")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add AAPL on XNAS" }));

    expect(await screen.findAllByText("Added")).toHaveLength(2);

    expect(requests.at(-1)).toEqual({
      route: "POST /stocks",
      body: {
        symbol: "AAPL",
        exchange: "XNAS",
        name: "Apple Inc",
        currency: "USD",
      },
    });
  });

  test("treats a stock added by someone else as added", async () => {
    const user = userEvent.setup();

    mockApi({
      "GET /stocks/search": () => [200, { results: [apple] }],
      "POST /stocks": () => [409, { error: "Stock already exists" }],
    });

    render(<StockSearch />);

    await search(user, "apple");
    await user.click(
      await screen.findByRole("button", { name: "Add AAPL on XNAS" }),
    );

    expect(await screen.findByText("Added")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("shows search errors", async () => {
    const user = userEvent.setup();

    mockApi({
      "GET /stocks/search": () => [
        502,
        { error: "Stock search service returned an error." },
      ],
    });

    render(<StockSearch />);

    await search(user, "apple");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Stock search service returned an error.",
    );
  });

  test("tells when nothing was found", async () => {
    const user = userEvent.setup();

    mockApi({
      "GET /stocks/search": () => [200, { results: [] }],
    });

    render(<StockSearch />);

    await search(user, "zzzz");

    expect(
      await screen.findByText("No stocks found on supported exchanges."),
    ).toBeInTheDocument();
  });
});
