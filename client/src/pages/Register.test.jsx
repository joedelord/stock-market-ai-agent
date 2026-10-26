import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { useAuth } from "../context/useAuth";
import Register from "./Register";

vi.mock("../context/useAuth", () => ({
  useAuth: vi.fn(),
}));

const renderRegister = (register) => {
  useAuth.mockReturnValue({
    register,
    isAuthenticated: false,
    isLoading: false,
  });

  render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<Register />} />

        <Route path="/stocks" element={<h1>My stocks</h1>} />
      </Routes>
    </MemoryRouter>,
  );
};

const fillForm = async (user, confirmPassword) => {
  await user.type(screen.getByLabelText("Username"), "testuser");
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.type(screen.getByLabelText("Confirm password"), confirmPassword);

  await user.click(screen.getByRole("button", { name: "Create account" }));
};

describe("Register", () => {
  test("creates the account when the passwords match", async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockResolvedValue({});

    renderRegister(register);

    await fillForm(user, "password123");

    expect(register).toHaveBeenCalledWith({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    expect(
      await screen.findByRole("heading", { name: "My stocks" }),
    ).toBeInTheDocument();
  });

  test("stops when the passwords do not match", async () => {
    const user = userEvent.setup();
    const register = vi.fn();

    renderRegister(register);

    await fillForm(user, "different123");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Passwords do not match",
    );

    expect(register).not.toHaveBeenCalled();
  });
});
