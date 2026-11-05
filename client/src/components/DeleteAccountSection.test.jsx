import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AxiosError } from "axios";
import { describe, expect, test, vi } from "vitest";

import { useAuth } from "../context/useAuth";
import DeleteAccountSection from "./DeleteAccountSection";

vi.mock("../context/useAuth", () => ({
  useAuth: vi.fn(),
}));

const renderSection = (deleteAccount) => {
  useAuth.mockReturnValue({ deleteAccount });

  render(
    <MemoryRouter initialEntries={["/account"]}>
      <Routes>
        <Route path="/account" element={<DeleteAccountSection />} />
        <Route path="/" element={<h1>Home page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
};

const confirmWithPassword = async (user, password) => {
  await user.click(screen.getByRole("button", { name: "Delete my account" }));
  await user.type(
    screen.getByLabelText("Enter your password to confirm"),
    password,
  );
  await user.click(
    screen.getByRole("button", { name: "Permanently delete account" }),
  );
};

describe("DeleteAccountSection", () => {
  test("asks for the password before deleting", () => {
    renderSection(vi.fn());

    expect(
      screen.queryByLabelText("Enter your password to confirm"),
    ).not.toBeInTheDocument();
  });

  test("deletes the account and goes to the home page", async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn().mockResolvedValue();

    renderSection(deleteAccount);
    await confirmWithPassword(user, "password123");

    expect(deleteAccount).toHaveBeenCalledWith("password123");
    expect(
      await screen.findByRole("heading", { name: "Home page" }),
    ).toBeInTheDocument();
  });

  test("shows the server error and stays on the page", async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn().mockRejectedValue(
      new AxiosError("Bad request", undefined, undefined, null, {
        status: 400,
        data: { error: "Password is incorrect" },
      }),
    );

    renderSection(deleteAccount);
    await confirmWithPassword(user, "wrongpassword");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password is incorrect",
    );
    expect(
      screen.getByLabelText("Enter your password to confirm"),
    ).toBeEnabled();
  });

  test("cancel hides the form", async () => {
    const user = userEvent.setup();

    renderSection(vi.fn());

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("button", { name: "Delete my account" }),
    ).toBeInTheDocument();
  });
});
