import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import Profile from "./Profile";
import { useAuth } from "../context/useAuth";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));

test("shows the signed-in user's details and account destinations", () => {
  useAuth.mockReturnValue({ user: { username: "Jouni", email: "jouni@example.com", role: "user" } });
  render(<MemoryRouter initialEntries={["/account"]}><Profile /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "My profile" })).toBeInTheDocument();
  expect(screen.getAllByText("jouni@example.com")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Profile overview" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/account/password");
  expect(screen.getByRole("link", { name: /My stocks/ })).toHaveAttribute("href", "/stocks");
  expect(screen.queryByRole("link", { name: /Administration/ })).not.toBeInTheDocument();
});

test.each(["admin", "moderator"])("preserves administration access for %s", (role) => {
  useAuth.mockReturnValue({ user: { username: "Jouni", email: "jouni@example.com", role } });
  render(<MemoryRouter><Profile /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Administration/ })).toHaveAttribute("href", "/admin");
});
