import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import StockAnalysis from "./StockAnalysis";
import api from "../services/api";
import { mockApi, restoreApi } from "../test/mockApi";

const stock = {
  id: 1,
  symbol: "AAPL",
  exchange: "XNAS",
  name: "Apple",
  currency: "USD",
  is_active: true,
};

function createAnalysis(text) {
  return {
    stock,
    metrics: {
      interval: "15min",
      pointCount: 100,
      periodStart: "2026-10-19T13:30:00.000Z",
      periodEnd: "2026-10-20T20:00:00.000Z",
    },
    analysis: {
      text,
      model: "test-model",
      generatedAt: "2026-10-20T20:05:00.000Z",
    },
  };
}

// Holds the request open until the test resolves it, so the loading state
// can be checked.
function mockPendingApi() {
  const pending = { count: 0, resolve: null };

  api.defaults.adapter = (config) => {
    pending.count += 1;

    return new Promise((resolve) => {
      pending.resolve = (data) =>
        resolve({ status: 200, data, headers: {}, config, statusText: "" });
    });
  };

  return pending;
}

afterEach(() => {
  restoreApi();
});

describe("StockAnalysis", () => {
  it("shows the analysis and its data period", async () => {
    const user = userEvent.setup();
    const requests = mockApi({
      "POST /stocks/1/analysis": () => [
        200,
        createAnalysis("Price rose over the period."),
      ],
    });

    render(<StockAnalysis stock={stock} />);

    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect(
      await screen.findByText("Price rose over the period."),
    ).toBeInTheDocument();

    expect(screen.getByText("100 15-minute price points")).toBeInTheDocument();
    expect(screen.getByText(/20 Oct 2026, 23:05/)).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Analyze again" }),
    ).toBeEnabled();

    expect(requests).toHaveLength(1);
  });

  it("shows the server's error message", async () => {
    const user = userEvent.setup();

    mockApi({
      "POST /stocks/1/analysis": () => [
        429,
        { error: "Too many analysis requests. Please try again later." },
      ],
    });

    render(<StockAnalysis stock={stock} />);

    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many analysis requests. Please try again later.",
    );

    expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled();
  });

  it("disables analysis for inactive stocks", async () => {
    const requests = mockApi({});

    render(<StockAnalysis stock={{ ...stock, is_active: false }} />);

    expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();

    expect(
      screen.getByText("Analysis is unavailable for inactive stocks."),
    ).toBeInTheDocument();

    expect(requests).toHaveLength(0);
  });

  it("sends one request at a time and keeps the previous result visible", async () => {
    const user = userEvent.setup();
    const pending = mockPendingApi();

    render(<StockAnalysis stock={stock} />);

    await user.click(screen.getByRole("button", { name: "Analyze" }));

    const loadingButton = screen.getByRole("button", { name: "Analyzing..." });

    expect(loadingButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Generating analysis...",
    );

    await user.click(loadingButton);
    expect(pending.count).toBe(1);

    pending.resolve(createAnalysis("First analysis."));
    expect(await screen.findByText("First analysis.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Analyze again" }));

    expect(screen.getByText("First analysis.")).toBeInTheDocument();

    pending.resolve(createAnalysis("Second analysis."));

    expect(await screen.findByText("Second analysis.")).toBeInTheDocument();
    expect(screen.queryByText("First analysis.")).not.toBeInTheDocument();
    expect(pending.count).toBe(2);
  });
});
