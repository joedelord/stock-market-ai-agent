import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useAuth } from "../context/useAuth";
import { mockApi, restoreApi } from "../test/mockApi";
import EmailPreferencesSection from "./EmailPreferencesSection";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));

const ROUTE = "PATCH /auth/me/email-preferences";

const renderWithUser = (user) => {
  const reloadUser = vi.fn().mockResolvedValue();

  useAuth.mockReturnValue({ user, reloadUser });
  render(<EmailPreferencesSection />);

  return reloadUser;
};

afterEach(() => {
  restoreApi();
});

describe("EmailPreferencesSection", () => {
  test("shows the current setting", () => {
    renderWithUser({ email_alerts_enabled: false, email_verified_at: "2026-11-01" });

    expect(
      screen.getByRole("checkbox", { name: "Email me when an alert is triggered" }),
    ).not.toBeChecked();
  });

  test("saves the change and reloads the user", async () => {
    const requests = mockApi({ [ROUTE]: () => [200, { user: {} }] });
    const reloadUser = renderWithUser({
      email_alerts_enabled: true,
      email_verified_at: "2026-11-01",
    });

    await userEvent.click(screen.getByRole("checkbox"));

    expect(requests).toEqual([
      { route: ROUTE, body: { emailAlertsEnabled: false } },
    ]);
    expect(reloadUser).toHaveBeenCalled();
  });

  test("tells an unverified user that emails need a confirmed address", () => {
    renderWithUser({ email_alerts_enabled: true, email_verified_at: null });

    expect(screen.getByText(/Confirm your email address first/)).toBeInTheDocument();
    expect(screen.queryByText(/spam or junk folder/)).not.toBeInTheDocument();
  });

  test("points a verified user to the spam folder", () => {
    renderWithUser({ email_alerts_enabled: true, email_verified_at: "2026-11-01" });

    expect(screen.getByText(/spam or junk folder/)).toBeInTheDocument();
  });

  test("shows the server error when saving fails", async () => {
    mockApi({ [ROUTE]: () => [500, { error: "Something went wrong" }] });
    renderWithUser({ email_alerts_enabled: true, email_verified_at: "2026-11-01" });

    await userEvent.click(screen.getByRole("checkbox"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong",
    );
  });
});
