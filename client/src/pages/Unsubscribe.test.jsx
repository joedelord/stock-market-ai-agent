import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useAuth } from "../context/useAuth";
import { mockApi, restoreApi } from "../test/mockApi";
import Unsubscribe from "./Unsubscribe";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));

const TOKEN = `1.${"a".repeat(64)}`;
const ROUTE = `POST /auth/unsubscribe?token=${encodeURIComponent(TOKEN)}`;

let reloadUser;

const renderAt = (url) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Unsubscribe />
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

describe("Unsubscribe", () => {
  test("explains when the link has no token", () => {
    renderAt("/unsubscribe");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This unsubscribe link is not valid.",
    );
  });

  test("does nothing until the user confirms", () => {
    const requests = mockApi({});

    renderAt(`/unsubscribe?token=${TOKEN}`);

    expect(
      screen.getByRole("button", { name: "Turn off alert emails" }),
    ).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  test("turns alert emails off after confirmation", async () => {
    const requests = mockApi({
      [ROUTE]: () => [200, { message: "Alert emails turned off" }],
    });

    renderAt(`/unsubscribe?token=${TOKEN}`);

    await userEvent.click(
      screen.getByRole("button", { name: "Turn off alert emails" }),
    );

    expect(
      await screen.findByText(/no longer get alert emails/),
    ).toBeInTheDocument();
    expect(requests).toEqual([{ route: ROUTE, body: undefined }]);
    expect(reloadUser).not.toHaveBeenCalled();
  });

  test("reloads the signed-in user so the profile shows the change", async () => {
    useAuth.mockReturnValue({ isAuthenticated: true, reloadUser });
    mockApi({ [ROUTE]: () => [200, { message: "Alert emails turned off" }] });

    renderAt(`/unsubscribe?token=${TOKEN}`);

    await userEvent.click(
      screen.getByRole("button", { name: "Turn off alert emails" }),
    );

    await screen.findByText(/no longer get alert emails/);
    expect(reloadUser).toHaveBeenCalled();
  });

  test("shows the server error for an invalid link", async () => {
    mockApi({ [ROUTE]: () => [400, { error: "Invalid unsubscribe link" }] });

    renderAt(`/unsubscribe?token=${TOKEN}`);

    await userEvent.click(
      screen.getByRole("button", { name: "Turn off alert emails" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid unsubscribe link",
    );
  });
});
