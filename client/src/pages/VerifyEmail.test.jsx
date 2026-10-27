import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useAuth } from "../context/useAuth";
import { mockApi, restoreApi } from "../test/mockApi";
import VerifyEmail from "./VerifyEmail";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));

const TOKEN = "a".repeat(64);

let reloadUser;

const renderAt = (url) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <VerifyEmail />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  reloadUser = vi.fn();
  useAuth.mockReturnValue({ isAuthenticated: false, reloadUser });
});

afterEach(() => {
  restoreApi();
});

describe("VerifyEmail", () => {
  test("explains when the link has no token", () => {
    renderAt("/verify-email");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This verification link is not valid.",
    );
  });

  test("verifies the email with the token from the link", async () => {
    const requests = mockApi({
      "POST /auth/verify-email": () => [200, { message: "Email verified" }],
    });

    renderAt(`/verify-email?token=${TOKEN}`);

    expect(await screen.findByText(/has been verified/)).toBeInTheDocument();

    expect(requests).toEqual([
      { route: "POST /auth/verify-email", body: { token: TOKEN } },
    ]);
    expect(reloadUser).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });

  test("shows the server error for a used or expired link", async () => {
    useAuth.mockReturnValue({ isAuthenticated: true, reloadUser });

    mockApi({
      "POST /auth/verify-email": () => [
        400,
        { error: "Invalid or expired verification link" },
      ],
    });

    renderAt(`/verify-email?token=${TOKEN}`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid or expired verification link",
    );
    expect(
      screen.getByRole("link", { name: "Go to my stocks" }),
    ).toBeInTheDocument();
  });
});
