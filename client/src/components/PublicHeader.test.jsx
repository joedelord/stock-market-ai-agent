import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import PublicHeader from "./PublicHeader";

function renderHeader(props) {
  render(<MemoryRouter><PublicHeader {...props} /></MemoryRouter>);
}

test("shows only login links, without main navigation", () => {
  renderHeader();
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Markets" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
});

test("shows a loading state while the session is checked", () => {
  renderHeader({ isLoading: true });
  expect(screen.getByRole("status")).toHaveTextContent("Loading account…");
  expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
});
