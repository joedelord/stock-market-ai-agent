import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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

          <Route path="/stocks" element={<h1>My stocks</h1>} />
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
        name: "My stocks",
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


test("preserves an alert destination including its stock selection after login", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ login: vi.fn().mockResolvedValue(), isAuthenticated: false, isLoading: false });
  render(<MemoryRouter initialEntries={[{ pathname: "/login", state: { from: { pathname: "/alerts", search: "?stockId=2", hash: "#create" } } }]}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/alerts" element={<Destination />} />
  </Routes></MemoryRouter>);
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.click(screen.getByRole("button", { name: "Login" }));
  expect(await screen.findByText("/alerts?stockId=2#create")).toBeInTheDocument();
});

function Destination() {
  const location = useLocation();
  return <p>{location.pathname}{location.search}{location.hash}</p>;
}

test("redirects an already authenticated user straight to stocks", async () => {
  useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  render(<MemoryRouter initialEntries={["/login"]}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/stocks" element={<h1>My stocks</h1>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "My stocks" })).toBeInTheDocument();
});
