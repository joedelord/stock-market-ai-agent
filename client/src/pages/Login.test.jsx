import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, test, vi } from "vitest";

import Login from "./Login";
import { useAuth } from "../context/useAuth";

vi.mock("../context/useAuth", () => ({
  useAuth: vi.fn(),
}));

describe("Login", () => {
  test("submits email and password", async () => {
    const user = userEvent.setup();

    const login = vi.fn().mockResolvedValue({
      id: 1,
      username: "testuser",
      email: "test@example.com",
      role: "user",
    });

    useAuth.mockReturnValue({
      login,
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "test@example.com");

    await user.type(screen.getByLabelText("Password"), "password123");

    await user.click(
      screen.getByRole("button", {
        name: "Login",
      }),
    );

    expect(login).toHaveBeenCalledWith("test@example.com", "password123");

    expect(
      await screen.findByRole("heading", {
        name: "Dashboard",
      }),
    ).toBeInTheDocument();
  });
  test("shows error when login fails", async () => {
    const user = userEvent.setup();

    const login = vi.fn().mockRejectedValue({
      response: {
        data: {
          error: "Invalid email or password",
        },
      },
    });

    useAuth.mockReturnValue({
      login,
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "test@example.com");

    await user.type(screen.getByLabelText("Password"), "wrongpassword");

    await user.click(
      screen.getByRole("button", {
        name: "Login",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password",
    );
  });
});
