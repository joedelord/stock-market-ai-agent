import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, test, vi } from "vitest";
import AppLayout from "./AppLayout";
import { useAuth } from "../context/useAuth";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("./NotificationCenter", () => ({ default: () => <button>Notifications</button> }));

function renderLayout(role = "user") {
  const logout = vi.fn().mockResolvedValue();
  useAuth.mockReturnValue({ user: { username: "Jouni", role }, logout });
  render(<MemoryRouter initialEntries={["/stocks"]}><Routes>
    <Route element={<AppLayout />}><Route path="/stocks" element={<main id="main-content">Watchlist content</main>} /></Route>
    <Route path="/" element={<h1>Markets home</h1>} />
  </Routes></MemoryRouter>);
  return logout;
}

test("provides active navigation, account links and keyboard dismissal", async () => {
  const user = userEvent.setup();
  renderLayout();
  expect(screen.getByRole("link", { name: "My stocks" })).toHaveAttribute("aria-current", "page");
  await user.click(screen.getByText("Jouni"));
  expect(screen.getByRole("link", { name: "My profile" })).toHaveAttribute("href", "/account");
  expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.getByText("Jouni").closest("details")).not.toHaveAttribute("open");
});

test("closes the account menu on an outside click", async () => {
  const user = userEvent.setup();
  renderLayout();
  await user.click(screen.getByText("Jouni"));
  expect(screen.getByText("Jouni").closest("details")).toHaveAttribute("open");
  await user.click(screen.getByText("Watchlist content"));
  expect(screen.getByText("Jouni").closest("details")).not.toHaveAttribute("open");
});

test("exposes administration for moderators and logs out to the public home", async () => {
  const user = userEvent.setup();
  const logout = renderLayout("moderator");
  await user.click(screen.getByText("Jouni"));
  expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
  await user.click(screen.getByRole("button", { name: "Log out" }));
  expect(logout).toHaveBeenCalledOnce();
  expect(await screen.findByRole("heading", { name: "Markets home" })).toBeInTheDocument();
});
