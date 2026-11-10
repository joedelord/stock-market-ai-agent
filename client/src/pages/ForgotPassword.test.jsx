import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";

import { mockApi, restoreApi } from "../test/mockApi";
import ForgotPassword from "./ForgotPassword";

const MESSAGE = "If an account exists for that email, a reset link has been sent";

afterEach(() => {
  restoreApi();
});

test("confirms the request and points to the spam folder", async () => {
  const requests = mockApi({
    "POST /auth/forgot-password": () => [200, { message: MESSAGE }],
  });

  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  );

  await userEvent.type(screen.getByLabelText(/email/i), "jouni@example.com");
  await userEvent.click(screen.getByRole("button"));

  expect(await screen.findByRole("status")).toHaveTextContent(MESSAGE);
  expect(screen.getByText(/Check your spam or junk folder/)).toBeInTheDocument();
  expect(requests).toEqual([
    {
      route: "POST /auth/forgot-password",
      body: { email: "jouni@example.com" },
    },
  ]);
});
