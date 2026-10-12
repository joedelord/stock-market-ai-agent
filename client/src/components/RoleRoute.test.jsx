import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, test, vi } from "vitest";

import RoleRoute from "./RoleRoute";
import { useAuth } from "../context/useAuth";

vi.mock("../context/useAuth", () => ({
  useAuth: vi.fn(),
}));

function LoginPage() {
  const location = useLocation();

  return <h1>Login, then go to {location.state?.from?.pathname}</h1>;
}

describe("RoleRoute", () => {
  test("remembers the requested page when sending a guest to login", () => {
    useAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RoleRoute allowedRoles={["admin"]} />}>
            <Route path="/admin" element={<h1>Admin page</h1>} />
          </Route>

          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Login, then go to /admin",
      }),
    ).toBeInTheDocument();
  });

  test("redirects normal user away from admin page", () => {
    useAuth.mockReturnValue({
      user: {
        role: "user",
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RoleRoute allowedRoles={["admin"]} />}>
            <Route path="/admin" element={<h1>Admin page</h1>} />
          </Route>

          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Dashboard",
      }),
    ).toBeInTheDocument();
  });

  test("allows admin to access admin page", () => {
    useAuth.mockReturnValue({
      user: {
        role: "admin",
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RoleRoute allowedRoles={["admin"]} />}>
            <Route path="/admin" element={<h1>Admin page</h1>} />
          </Route>

          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Admin page",
      }),
    ).toBeInTheDocument();
  });
});
