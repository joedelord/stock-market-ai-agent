import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { mockApi, restoreApi } from "../test/mockApi";
import ResetPassword from "./ResetPassword";

const TOKEN = "a".repeat(64);

const renderAt = (url) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ResetPassword />
    </MemoryRouter>,
  );
};

afterEach(() => {
  restoreApi();
});

describe("ResetPassword", () => {
  test("explains when the link has no token", () => {
    renderAt("/reset-password");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This reset link is not valid.",
    );
  });

  test("checks that the passwords match before sending", async () => {
    const user = userEvent.setup();
    const requests = mockApi({});

    renderAt(`/reset-password?token=${TOKEN}`);

    await user.type(screen.getByLabelText("New password"), "newpassword456");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "different456",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Passwords do not match",
    );

    expect(requests).toHaveLength(0);
  });

  test("resets the password with the token from the link", async () => {
    const user = userEvent.setup();

    const requests = mockApi({
      "POST /auth/reset-password": () => [
        200,
        { message: "Password has been reset" },
      ],
    });

    renderAt(`/reset-password?token=${TOKEN}`);

    await user.type(screen.getByLabelText("New password"), "newpassword456");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "newpassword456",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your password has been reset.",
    );

    expect(requests[0].body).toEqual({
      token: TOKEN,
      password: "newpassword456",
    });
  });

  test("shows an expired-link error from the server", async () => {
    const user = userEvent.setup();

    mockApi({
      "POST /auth/reset-password": () => [
        400,
        { error: "Invalid or expired reset token" },
      ],
    });

    renderAt(`/reset-password?token=${TOKEN}`);

    await user.type(screen.getByLabelText("New password"), "newpassword456");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "newpassword456",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid or expired reset token",
    );
  });
});
