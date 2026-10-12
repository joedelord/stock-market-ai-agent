import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import AddUserForm from "./AddUserForm";

describe("AddUserForm", () => {
  test("keeps the input when creating the user fails", async () => {
    const user = userEvent.setup();

    const onCreateUser = vi
      .fn()
      .mockRejectedValue(new Error("Email is already in use"));

    render(<AddUserForm onCreateUser={onCreateUser} onCancel={() => {}} />);

    await user.type(screen.getByPlaceholderText("Username"), "newuser");
    await user.type(screen.getByPlaceholderText("Email"), "new@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "password123");

    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(onCreateUser).toHaveBeenCalled();

    expect(screen.getByPlaceholderText("Username")).toHaveValue("newuser");

    expect(
      screen.getByRole("button", { name: "Create user" }),
    ).not.toBeDisabled();
  });
});
