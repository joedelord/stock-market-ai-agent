import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { useAuth } from "../context/useAuth";
import { mockApi, restoreApi } from "../test/mockApi";
import EmailVerificationBanner from "./EmailVerificationBanner";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));

const unverifiedUser = { email: "jouni@example.com", email_verified_at: null };

afterEach(() => {
  restoreApi();
});

test("is hidden once the email is verified", () => {
  useAuth.mockReturnValue({ user: { ...unverifiedUser, email_verified_at: "2026-10-26T12:00:00Z" } });
  render(<EmailVerificationBanner />);
  expect(screen.queryByRole("region", { name: "Email verification" })).not.toBeInTheDocument();
});

test("resends the verification email", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ user: unverifiedUser });
  const requests = mockApi({ "POST /auth/resend-verification": () => [200, { message: "Verification email sent" }] });
  render(<EmailVerificationBanner />);
  await user.click(screen.getByRole("button", { name: "Resend email" }));
  expect(await screen.findByRole("status")).toHaveTextContent("We sent a new link to jouni@example.com.");
  expect(requests).toHaveLength(1);
});

test("shows the rate limit error", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ user: unverifiedUser });
  mockApi({ "POST /auth/resend-verification": () => [429, { error: "Too many verification emails requested. Please try again later." }] });
  render(<EmailVerificationBanner />);
  await user.click(screen.getByRole("button", { name: "Resend email" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Too many verification emails requested");
});
