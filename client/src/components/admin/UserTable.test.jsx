import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import UserTable from "./UserTable";

const currentUser = { id: 1, username: "me", role: "moderator" };

const users = [
  currentUser,
  { id: 2, username: "other", email: "other@example.com", role: "user" },
];

describe("UserTable", () => {
  test("shows a read-only view to moderators", () => {
    render(
      <UserTable
        users={users}
        currentUser={currentUser}
        canManage={false}
        onRoleChange={() => {}}
        onDeleteUser={() => {}}
      />,
    );

    expect(screen.getByText("other")).toBeInTheDocument();

    expect(
      screen.queryByRole("columnheader", { name: "Email" }),
    ).not.toBeInTheDocument();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  test("lets admins manage users", () => {
    render(
      <UserTable
        users={users}
        currentUser={{ ...currentUser, role: "admin" }}
        canManage
        onRoleChange={() => {}}
        onDeleteUser={() => {}}
      />,
    );

    expect(screen.getByText("other@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
