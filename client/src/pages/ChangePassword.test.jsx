import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import ChangePassword from "./ChangePassword";
import { useAuth } from "../context/useAuth";
import { mockApi, restoreApi } from "../test/mockApi";

vi.mock("../context/useAuth", () => ({ useAuth: vi.fn() }));
afterEach(restoreApi);

function renderPage() {
  useAuth.mockReturnValue({ user: { username: "Jouni", email: "jouni@example.com", role: "user" } });
  render(<MemoryRouter initialEntries={["/account/password"]}><ChangePassword /></MemoryRouter>);
  return userEvent.setup();
}

async function fill(user, confirm = "newpassword123") {
  await user.type(screen.getByLabelText("Current password"), "oldpassword123");
  await user.type(screen.getByLabelText("New password", { exact: true }), "newpassword123");
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

test("changes the password, clears fields and confirms other devices are signed out", async () => {
  const requests = mockApi({ "PATCH /auth/password": () => [200, { message: "Password changed" }] });
  const user = renderPage();
  await fill(user);
  expect(requests[0].body).toEqual({ currentPassword: "oldpassword123", newPassword: "newpassword123" });
  expect(await screen.findByRole("status")).toHaveTextContent("logged out on your other devices");
  expect(screen.getByLabelText("Current password")).toHaveValue("");
  expect(screen.getByLabelText("New password", { exact: true })).toHaveValue("");
  expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  expect(screen.getByRole("link", { name: "Back to my profile" })).toHaveAttribute("href", "/account");
  expect(screen.getByRole("link", { name: "Password & security" })).toHaveAttribute("aria-current", "page");
});

test("rejects mismatching passwords before sending a request", async () => {
  const requests = mockApi({});
  const user = renderPage();
  await fill(user, "differentpassword");
  expect(screen.getByRole("alert")).toHaveTextContent("New passwords do not match");
  expect(requests).toHaveLength(0);
});

test("shows server errors and leaves the form available for correction", async () => {
  mockApi({ "PATCH /auth/password": () => [400, { error: "Current password is incorrect" }] });
  const user = renderPage();
  await fill(user);
  expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");
  expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
  expect(screen.getByLabelText("Current password")).toHaveValue("oldpassword123");
});
