import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import Alerts from "./Alerts";
import { mockApi, restoreApi } from "../test/mockApi";

const stock = {
  id: "1",
  name: "Apple",
  symbol: "AAPL",
  exchange: "XNAS",
  currency: "USD",
  is_active: true,
};
const alert = {
  id: "12",
  stock_id: "1",
  name: "Apple",
  symbol: "AAPL",
  exchange: "XNAS",
  currency: "USD",
  alert_type: "daily_change_above",
  threshold: "3.000000",
  repeat_mode: "daily",
  is_active: true,
  last_triggered_at: null,
};
function setup(overrides = {}, url = "/alerts") {
  const requests = mockApi({
    "GET /stocks": () => [200, { stocks: [stock] }],
    "GET /alerts": () => [200, { alerts: [] }],
    "GET /notifications": () => [200, { notifications: [], unreadCount: 0 }],
    ...overrides,
  });
  render(
    <MemoryRouter initialEntries={[url]}>
      <Alerts />
    </MemoryRouter>,
  );
  return requests;
}
afterEach(restoreApi);

describe("Alerts", () => {
  it("preselects a stock from the watchlist link and creates a price alert", async () => {
    const user = userEvent.setup();
    const requests = setup(
      {
        "POST /alerts": (body) => [
          201,
          {
            alert: {
              ...alert,
              alert_type: body.alertType,
              threshold: String(body.threshold),
              repeat_mode: body.repeatMode,
            },
          },
        ],
      },
      "/alerts?stockId=1",
    );
    const form = await screen.findByRole("form", { name: "Create alert" });
    expect(within(form).getByLabelText("Stock")).toHaveValue("1");
    await user.selectOptions(
      within(form).getByLabelText("Condition"),
      "price_above",
    );
    await user.type(within(form).getByLabelText("Target price (USD)"), "100");
    await user.click(
      within(form).getByRole("button", { name: "Create alert" }),
    );
    expect(await screen.findByText("Price ≥ 100 USD")).toBeInTheDocument();
    expect(requests.find((req) => req.route === "POST /alerts").body).toEqual({
      stockId: "1",
      alertType: "price_above",
      threshold: 100,
      repeatMode: "once",
    });
  });

  it("converts a positive daily fall input into a negative backend threshold", async () => {
    const user = userEvent.setup();
    const requests = setup({
      "POST /alerts": () => [
        201,
        {
          alert: {
            ...alert,
            alert_type: "daily_change_below",
            threshold: "-4",
          },
        },
      ],
    });
    const form = await screen.findByRole("form", { name: "Create alert" });
    await user.selectOptions(within(form).getByLabelText("Stock"), "1");
    await user.selectOptions(
      within(form).getByLabelText("Condition"),
      "daily_change_below",
    );
    await user.type(within(form).getByLabelText("Daily change (%)"), "4");
    await user.selectOptions(within(form).getByLabelText("Repeat"), "daily");
    await user.click(
      within(form).getByRole("button", { name: "Create alert" }),
    );
    expect(await screen.findByText("Day change ≤ -4%")).toBeInTheDocument();
    expect(
      requests.find((req) => req.route === "POST /alerts").body.threshold,
    ).toBe(-4);
  });

  it("explains which threshold rule failed without sending a request", async () => {
    const user = userEvent.setup();
    const requests = setup({}, "/alerts?stockId=1");
    const form = await screen.findByRole("form", { name: "Create alert" });
    await user.selectOptions(
      within(form).getByLabelText("Condition"),
      "daily_change_below",
    );
    const input = within(form).getByLabelText("Daily change (%)");
    await user.type(input, "150");
    // Submit directly so the browser's own min/max checks do not run first.
    fireEvent.submit(form);
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "A daily fall cannot exceed 100%.",
    );
    await user.clear(input);
    await user.type(input, "1.1234567");
    fireEvent.submit(form);
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Use at most 6 decimal places.",
    );
    expect(requests.some((req) => req.route === "POST /alerts")).toBe(false);
  });

  it("edits a complete rule and keeps joined stock information", async () => {
    const user = userEvent.setup();
    const requests = setup({
      "GET /alerts": () => [200, { alerts: [alert] }],
      "PATCH /alerts/12": (body) => [
        200,
        {
          alert: {
            id: "12",
            stock_id: "1",
            alert_type: body.alertType,
            threshold: String(body.threshold),
            repeat_mode: body.repeatMode,
            is_active: body.isActive,
          },
        },
      ],
    });
    await user.click(
      await screen.findByRole("button", { name: "Edit alert for AAPL" }),
    );
    const form = screen.getByRole("form", { name: "Edit alert" });
    expect(within(form).getByLabelText("Stock")).toBeDisabled();
    await user.clear(within(form).getByLabelText("Daily change (%)"));
    await user.type(within(form).getByLabelText("Daily change (%)"), "5");
    await user.click(
      within(form).getByRole("button", { name: "Save changes" }),
    );
    expect(await screen.findByText("Day change ≥ +5%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit alert for AAPL" }),
    ).toBeEnabled();
    expect(
      requests.find((req) => req.route === "PATCH /alerts/12").body,
    ).toEqual({
      alertType: "daily_change_above",
      threshold: 5,
      repeatMode: "daily",
      isActive: true,
    });
  });

  it("pauses and enables alerts without resending a rule", async () => {
    const user = userEvent.setup();
    const requests = setup({
      "GET /alerts": () => [200, { alerts: [alert] }],
      "PATCH /alerts/12": (body) => [
        200,
        { alert: { ...alert, is_active: body.isActive } },
      ],
    });
    await user.click(
      await screen.findByRole("button", { name: "Pause alert for AAPL" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Enable alert for AAPL" }),
    );
    expect(await screen.findByText("Alert enabled.")).toBeInTheDocument();
    expect(
      requests
        .filter((req) => req.route === "PATCH /alerts/12")
        .map((req) => req.body),
    ).toEqual([{ isActive: false }, { isActive: true }]);
  });

  it("requires delete confirmation and retains an alert when deletion fails", async () => {
    const user = userEvent.setup();
    const requests = setup({
      "GET /alerts": () => [200, { alerts: [alert] }],
      "DELETE /alerts/12": () => [500, { error: "Could not delete rule" }],
    });
    await user.click(
      await screen.findByRole("button", { name: "Delete alert for AAPL" }),
    );
    expect(requests.some((req) => req.route === "DELETE /alerts/12")).toBe(
      false,
    );
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not delete rule",
    );
    expect(screen.getByText("Day change ≥ +3%")).toBeInTheDocument();
  });

  it("removes the confirmed alert", async () => {
    const user = userEvent.setup();
    setup({
      "GET /alerts": () => [200, { alerts: [alert] }],
      "DELETE /alerts/12": () => [204],
    });
    await user.click(
      await screen.findByRole("button", { name: "Delete alert for AAPL" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByText("Alert deleted.")).toBeInTheDocument();
    expect(screen.queryByText("Day change ≥ +3%")).not.toBeInTheDocument();
  });

  it("keeps failed form input and shows the backend limit error", async () => {
    const user = userEvent.setup();
    setup(
      {
        "POST /alerts": () => [
          409,
          { error: "You can have at most 50 alerts" },
        ],
      },
      "/alerts?stockId=1",
    );
    const form = await screen.findByRole("form", { name: "Create alert" });
    await user.type(within(form).getByLabelText("Daily change (%)"), "3");
    await user.click(
      within(form).getByRole("button", { name: "Create alert" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can have at most 50 alerts",
    );
    expect(within(form).getByLabelText("Daily change (%)")).toHaveValue(3);
  });

  it("lists existing alerts when the catalog fails and supports retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    setup({
      "GET /alerts": () => [200, { alerts: [alert] }],
      "GET /stocks": () =>
        fail
          ? [500, { error: "Catalog unavailable" }]
          : [200, { stocks: [stock] }],
    });
    expect(await screen.findByText("Day change ≥ +3%")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Catalog unavailable");
    fail = false;
    await user.click(
      screen.getByRole("button", { name: "Retry stock catalog" }),
    );
    expect(
      await screen.findByRole("form", { name: "Create alert" }),
    ).toBeInTheDocument();
  });

  it("offers retry after an alerts fetch failure", async () => {
    const user = userEvent.setup();
    let fail = true;
    setup({
      "GET /alerts": () =>
        fail ? [500, { error: "Alerts unavailable" }] : [200, { alerts: [] }],
    });
    await screen.findByText("Alerts unavailable");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry alerts" }));
    await waitFor(() =>
      expect(screen.queryByText("Alerts unavailable")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("form", { name: "Create alert" }),
    ).toBeInTheDocument();
  });
});
