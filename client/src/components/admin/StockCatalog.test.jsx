import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import StockCatalog from "./StockCatalog";
import { mockApi, restoreApi } from "../../test/mockApi";

const apple = {
  id: 1,
  symbol: "AAPL",
  exchange: "XNAS",
  name: "Apple Inc",
  currency: "USD",
  is_active: true,
  follower_count: 3,
  active_alert_count: 2,
};

const microsoft = {
  id: 2,
  symbol: "MSFT",
  exchange: "XNAS",
  name: "Microsoft",
  currency: "USD",
  is_active: true,
  follower_count: 0,
  active_alert_count: 0,
};

const catalog = (stocks, max = 20) => ({
  stocks,
  limit: { active: stocks.filter((stock) => stock.is_active).length, max },
});

afterEach(() => {
  restoreApi();
  vi.restoreAllMocks();
});

describe("StockCatalog", () => {
  test("lists stocks with their followers, alerts and the limit", async () => {
    mockApi({
      "GET /stocks/catalog": () => [200, catalog([apple, microsoft])],
    });

    render(<StockCatalog reloadKey={0} />);

    expect(await screen.findByText("2 / 20 active stocks")).toBeInTheDocument();

    const appleRow = screen.getByRole("row", { name: /AAPL/ });
    expect(within(appleRow).getByText("Apple Inc")).toBeInTheDocument();
    expect(within(appleRow).getByText("3")).toBeInTheDocument();
    expect(within(appleRow).getByText("2")).toBeInTheDocument();
  });

  test("warns when the limit is reached", async () => {
    mockApi({
      "GET /stocks/catalog": () => [200, catalog([apple, microsoft], 2)],
    });

    render(<StockCatalog reloadKey={0} />);

    expect(
      await screen.findByText(/The limit is reached/),
    ).toBeInTheDocument();
  });

  test("removes a stock after confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onStockDeleted = vi.fn();

    const requests = mockApi({
      "GET /stocks/catalog": () => [200, catalog([apple, microsoft])],
      "DELETE /stocks/1": () => [200, { message: "Stock deleted" }],
    });

    render(<StockCatalog reloadKey={0} onStockDeleted={onStockDeleted} />);

    await user.click(
      await screen.findByRole("button", { name: "Remove AAPL on XNAS" }),
    );

    expect(confirm.mock.calls[0][0]).toContain(
      "It is on 3 watchlists and has 2 active alerts. They will be deleted.",
    );
    expect(requests.at(-1).route).toBe("DELETE /stocks/1");
    expect(await screen.findByText("1 / 20 active stocks")).toBeInTheDocument();
    expect(screen.queryByText("Apple Inc")).not.toBeInTheDocument();
    expect(onStockDeleted).toHaveBeenCalledWith(apple);
  });

  test("keeps the stock when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const requests = mockApi({
      "GET /stocks/catalog": () => [200, catalog([microsoft])],
    });

    render(<StockCatalog reloadKey={0} />);

    await user.click(
      await screen.findByRole("button", { name: "Remove MSFT on XNAS" }),
    );

    expect(requests.map((request) => request.route)).toEqual([
      "GET /stocks/catalog",
    ]);
    expect(screen.getByText("Microsoft")).toBeInTheDocument();
  });

  test("shows the server error when removing fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    mockApi({
      "GET /stocks/catalog": () => [200, catalog([microsoft])],
      "DELETE /stocks/2": () => [404, { error: "Stock not found" }],
    });

    render(<StockCatalog reloadKey={0} />);

    await user.click(
      await screen.findByRole("button", { name: "Remove MSFT on XNAS" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Stock not found",
    );
  });

  test("reloads when the reload key changes", async () => {
    let stocks = [microsoft];

    mockApi({
      "GET /stocks/catalog": () => [200, catalog(stocks)],
    });

    const { rerender } = render(<StockCatalog reloadKey={0} />);

    expect(await screen.findByText("1 / 20 active stocks")).toBeInTheDocument();

    stocks = [apple, microsoft];
    rerender(<StockCatalog reloadKey={1} />);

    expect(await screen.findByText("2 / 20 active stocks")).toBeInTheDocument();
  });
});
