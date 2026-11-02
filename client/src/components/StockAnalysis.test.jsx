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
      sections: {
        priceMovement: text,
        movingAverages: "Too few points for moving averages.",
        newsContext: "News was not requested.",
        limitations: "The data may be incomplete.",
      },
      citedArticles: [],
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

    expect(screen.getByText(/Day change unavailable/)).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it("shows the stored day change, threshold and quote timestamp", async () => {
    const user = userEvent.setup();
    const result = createAnalysis("A falling quote despite rising bars.");
    result.metrics.dayMovement = {
      changePercent: -3, thresholdPercent: 3, thresholdMethod: "fixed",
      volatilityPercent: null, volatilityReturnCount: 0, isSignificant: true,
      priceTime: "2026-10-20T19:00:00.000Z",
    };
    mockApi({ "POST /stocks/1/analysis": () => [200, result] });
    render(<StockAnalysis stock={stock} />);
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    expect(await screen.findByText(/-3.00% vs previous session close/)).toBeInTheDocument();
    expect(screen.getByText(/Significant movement.*3.00%, fixed threshold/)).toBeInTheDocument();
    expect(screen.getByText(/Stored quote: 20 Oct 2026, 22:00/)).toBeInTheDocument();
  });

  it("explains a volatility-based threshold", async () => {
    const user = userEvent.setup();
    const result = createAnalysis("A calm stock moving more than usual.");
    result.metrics.dayMovement = {
      changePercent: 1.5, thresholdPercent: 1.2, thresholdMethod: "volatility",
      volatilityPercent: 0.6, volatilityReturnCount: 25, isSignificant: true,
      priceTime: "2026-10-20T19:00:00.000Z",
    };
    mockApi({ "POST /stocks/1/analysis": () => [200, result] });
    render(<StockAnalysis stock={stock} />);
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    expect(
      await screen.findByText(/≥ 1.20%, twice the typical daily move of 0.60% over 25 days/),
    ).toBeInTheDocument();
  });

  it("says when an analysis was reused", async () => {
    const user = userEvent.setup();
    const result = { ...createAnalysis("Unchanged analysis."), cached: true };
    mockApi({ "POST /stocks/1/analysis": () => [200, result] });
    render(<StockAnalysis stock={stock} />);
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    expect(await screen.findByText(/reused, because the price data and news have not changed/)).toBeInTheDocument();
  });

  it("warns that an earlier analysis is shown while the AI service is busy", async () => {
    const user = userEvent.setup();
    const result = { ...createAnalysis("Earlier analysis."), cached: true, stale: true };
    mockApi({ "POST /stocks/1/analysis": () => [200, result] });
    render(<StockAnalysis stock={stock} />);
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    expect(
      await screen.findByText(/AI service is busy, so this is an earlier analysis from 20 Oct 2026, 23:05/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reused, because/)).not.toBeInTheDocument();
  });

  it("shows company news links and publication times", async () => {
    const user = userEvent.setup();
    const result = createAnalysis("Price fell.");
    result.analysis.sections.newsContext = "Possible news context [1].";
    result.analysis.citedArticles = [1];
    result.news = { status: "available", articles: [{
      number: 1, title: "Company announcement", url: "https://example.com/news",
      source: "Example", publishedAt: "2026-10-20T19:00:00Z",
    }, {
      number: 2, title: "Other story", url: "https://example.com/other",
      source: "Example", publishedAt: "2026-10-20T18:00:00Z",
    }] };
    mockApi({ "POST /stocks/1/analysis": () => [200, result] });
    render(<StockAnalysis stock={stock} />);
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    const link = await screen.findByRole("link", { name: "Company announcement" });
    expect(link).toHaveAttribute("href", "https://example.com/news");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/Example · 20 Oct 2026, 22:00.*cited in the analysis/)).toBeInTheDocument();
    expect(screen.getByText(/Example · 20 Oct 2026, 21:00/)).not.toHaveTextContent("cited");
    expect(screen.getByRole("heading", { name: "Possible news context" })).toBeInTheDocument();
    expect(screen.getByText("Possible news context [1].")).toBeInTheDocument();
  });

  it.each([
    ["unavailable", "Company news is temporarily unavailable"],
    ["no_results", "No matching articles were returned"],
    ["not_configured", "Company news is not configured"],
    ["unsupported", "Company news coverage could not be verified"],
    ["not_requested", "News not requested"],
  ])("shows news status %s without hiding the analysis", async (status, message) => {
    const user = userEvent.setup();
    const result = createAnalysis("Price analysis remains available.");
    result.news = { status, articles: [] };
    mockApi({ "POST /stocks/1/analysis": () => [200, result] });
    render(<StockAnalysis stock={stock} />);
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
    expect(screen.getByText("Price analysis remains available.")).toBeInTheDocument();
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
      /Generating analysis\.\.\..*company news/,
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
