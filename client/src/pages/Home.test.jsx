import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import Home from "./Home";
import { useAuth } from "../context/useAuth";
import { mockApi, restoreApi } from "../test/mockApi";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../components/NotificationCenter", () => ({ default: () => <button>Notifications</button> }));
afterEach(restoreApi);
const apple = { id: 1, symbol: "AAPL", name: "Apple", exchange: "XNAS", currency: "USD", close: "105", day_change_percent: "5", follower_count: 3, price_time: "2026-10-23T14:00:00Z" };
const overview = { gainers: [apple], losers: [], mostFollowed: [apple], generatedAt: "2026-10-26T12:00:00Z" };
function renderHome(authenticated = false) {
  useAuth.mockReturnValue({ isAuthenticated: authenticated, isLoading: false, user: { username: "Jouni", role: "user" } });
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

test("shows public rankings with quote timestamps and registration links", async () => {
  mockApi({ "GET /stocks/overview": () => [200, overview] });
  renderHome();
  const gainers = await screen.findByRole("region", { name: "Top gainers" });
  expect(within(gainers).getByText("+5.00 %")).toBeInTheDocument();
  expect(within(gainers).getByText(/23\/10\/2026/)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Most followed" })).getByText("3 following")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Create your watchlist/ })).toHaveAttribute("href", "/register");
});

test("reloads the selected market and offers signed-in users their workspace", async () => {
  const user = userEvent.setup();
  const calls = mockApi({ "GET /stocks/overview": () => [200, overview] });
  renderHome(true);
  await screen.findByRole("region", { name: "Top gainers" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Market" }), "helsinki");
  await screen.findByRole("region", { name: "Top gainers" });
  expect(calls).toHaveLength(2);
  expect(screen.getByRole("link", { name: /Open my stocks/ })).toHaveAttribute("href", "/stocks");
  expect(screen.queryByRole("link", { name: /Create your watchlist/ })).not.toBeInTheDocument();
});

test("uses the app navbar with notifications and the account menu when logged in", async () => {
  mockApi({ "GET /stocks/overview": () => [200, overview] });
  renderHome(true);
  await screen.findByRole("region", { name: "Top gainers" });
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
  expect(within(nav).getByRole("link", { name: "My stocks" })).toHaveAttribute("href", "/stocks");
  expect(within(nav).getByRole("link", { name: "Alerts" })).toHaveAttribute("href", "/alerts");
  expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  expect(screen.getByText("Jouni")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
});

test("shows no main navigation when logged out", async () => {
  mockApi({ "GET /stocks/overview": () => [200, overview] });
  renderHome();
  await screen.findByRole("region", { name: "Top gainers" });
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
});

test("shows an error, then recovers when refreshed", async () => {
  const user = userEvent.setup();
  let attempts = 0;
  mockApi({ "GET /stocks/overview": () => ++attempts === 1 ? [503, { error: "Market data unavailable" }] : [200, overview] });
  renderHome();
  expect(await screen.findByRole("alert")).toHaveTextContent("Market data unavailable");
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("region", { name: "Top gainers" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps the current lists visible while refreshing", async () => {
  const user = userEvent.setup();
  let resolveSecond;
  let attempts = 0;
  mockApi({
    "GET /stocks/overview": () =>
      ++attempts === 1
        ? [200, overview]
        : new Promise((resolve) => {
            resolveSecond = () => resolve([200, overview]);
          }),
  });
  renderHome();
  await screen.findByRole("region", { name: "Top gainers" });
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  expect(screen.getByRole("region", { name: "Top gainers" })).toBeInTheDocument();
  resolveSecond();
  expect(await screen.findByRole("button", { name: "Refresh" })).toBeEnabled();
});
