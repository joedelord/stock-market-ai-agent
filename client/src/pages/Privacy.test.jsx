import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";

import { useAuth } from "../context/useAuth";
import Privacy from "./Privacy";

vi.mock("../context/useAuth", () => ({
  useAuth: vi.fn(),
}));

test("explains the stored data and links to account deletion", () => {
  useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

  render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole("heading", { name: "Privacy and terms of use" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Not investment advice" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "profile page" })).toHaveAttribute(
    "href",
    "/account",
  );
});
