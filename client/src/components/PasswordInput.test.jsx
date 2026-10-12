import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import PasswordInput from "./PasswordInput";

describe("PasswordInput", () => {
  test("shows and hides the password", async () => {
    const user = userEvent.setup();

    render(<PasswordInput aria-label="Password" defaultValue="secret123" />);

    const input = screen.getByLabelText("Password");

    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("secret123");

    await user.click(screen.getByRole("button", { name: "Hide password" }));

    expect(input).toHaveAttribute("type", "password");
  });

  test("does not submit the form when toggled", async () => {
    const user = userEvent.setup();
    let submitted = false;

    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = true;
        }}
      >
        <PasswordInput aria-label="Password" />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(submitted).toBe(false);
  });
});
