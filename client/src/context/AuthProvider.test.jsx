import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import api from "../services/api";
import { mockApi, restoreApi } from "../test/mockApi";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

function CurrentUser() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <p>Loading</p>;
  }

  return <p>{user ? `${user.username} (${user.role})` : "Logged out"}</p>;
}

function DeleteAccountButton({ password }) {
  const { deleteAccount } = useAuth();

  return (
    <button type="button" onClick={() => deleteAccount(password).catch(() => {})}>
      Delete account
    </button>
  );
}

const renderProvider = (children = null) => {
  render(
    <AuthProvider>
      <CurrentUser />
      {children}
    </AuthProvider>,
  );
};

afterEach(() => {
  restoreApi();
});

describe("AuthProvider", () => {
  test("logs out locally when the server ends the session", async () => {
    mockApi({
      "GET /auth/me": () => [
        200,
        { user: { username: "jouni", role: "user" } },
      ],
      "GET /users": () => [401, { error: "Authentication required" }],
    });

    renderProvider();

    expect(await screen.findByText("jouni (user)")).toBeInTheDocument();

    await act(() => api.get("/users").catch(() => {}));

    expect(screen.getByText("Logged out")).toBeInTheDocument();
  });

  test("stays logged in when a login attempt fails", async () => {
    mockApi({
      "GET /auth/me": () => [
        200,
        { user: { username: "jouni", role: "user" } },
      ],
      "POST /auth/login": () => [401, { error: "Invalid email or password" }],
    });

    renderProvider();

    expect(await screen.findByText("jouni (user)")).toBeInTheDocument();

    await act(() => api.post("/auth/login", {}).catch(() => {}));

    expect(screen.getByText("jouni (user)")).toBeInTheDocument();
  });

  test("reloads the user when a request is forbidden", async () => {
    let role = "admin";

    mockApi({
      "GET /auth/me": () => [200, { user: { username: "jouni", role } }],
      "GET /users": () => [403, { error: "Insufficient permissions" }],
    });

    renderProvider();

    expect(await screen.findByText("jouni (admin)")).toBeInTheDocument();

    role = "user";

    await act(() => api.get("/users").catch(() => {}));

    expect(await screen.findByText("jouni (user)")).toBeInTheDocument();
  });
  test("logs out after deleting the account", async () => {
    const requests = mockApi({
      "GET /auth/me": () => [
        200,
        { user: { username: "jouni", role: "user" } },
      ],
      "DELETE /auth/me": () => [200, { message: "Account deleted" }],
    });

    renderProvider(<DeleteAccountButton password="password123" />);

    expect(await screen.findByText("jouni (user)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByText("Logged out")).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({
      route: "DELETE /auth/me",
      body: { password: "password123" },
    });
  });

  test("stays logged in when account deletion fails", async () => {
    const requests = mockApi({
      "GET /auth/me": () => [
        200,
        { user: { username: "jouni", role: "user" } },
      ],
      "DELETE /auth/me": () => [400, { error: "Password is incorrect" }],
    });

    renderProvider(<DeleteAccountButton password="wrong" />);

    expect(await screen.findByText("jouni (user)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await vi.waitFor(() =>
      expect(requests.at(-1)?.route).toBe("DELETE /auth/me"),
    );
    expect(screen.getByText("jouni (user)")).toBeInTheDocument();
  });
});
