import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import NotificationCenter from "./NotificationCenter";
import { mockApi, restoreApi } from "../test/mockApi";

afterEach(restoreApi);
const notification = {
  id: "7",
  message: "AAPL reached 100 USD",
  price_time: "2026-10-23T13:00:00Z",
  read_at: null,
};

it("shows the total unread count and updates individual and bulk read state", async () => {
  const user = userEvent.setup();
  let item = { ...notification };
  let unreadCount = 8;
  const requests = mockApi({
    "GET /notifications": () => [200, { notifications: [item], unreadCount }],
    "PATCH /notifications/7": (body) => {
      item = { ...item, read_at: body.read ? "2026-10-23T14:00:00Z" : null };
      unreadCount += body.read ? -1 : 1;
      return [200, { notification: item }];
    },
    "PATCH /notifications": () => {
      unreadCount = 0;
      item = { ...item, read_at: "2026-10-23T14:00:00Z" };
      return [200, { updated: 8 }];
    },
  });
  render(<NotificationCenter />);
  await screen.findByLabelText("8 unread");
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  expect(screen.getByText(notification.message)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Mark as read" }));
  await screen.findByLabelText("7 unread");
  await user.click(screen.getByRole("button", { name: "Mark as unread" }));
  await screen.findByLabelText("8 unread");
  await user.click(screen.getByRole("button", { name: "Mark all as read" }));
  await waitFor(() =>
    expect(screen.queryByLabelText(/unread$/)).not.toBeInTheDocument(),
  );
  expect(
    requests
      .filter((req) => req.route === "PATCH /notifications/7")
      .map((req) => req.body),
  ).toEqual([{ read: true }, { read: false }]);
  expect(
    requests.find((req) => req.route === "PATCH /notifications").body,
  ).toEqual({ read: true });
  await user.click(
    screen.getByRole("button", { name: "Refresh notifications" }),
  );
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: /Notifications/ })).toHaveFocus();
  expect(screen.queryByText(notification.message)).not.toBeInTheDocument();
});

it("shows load failures and recovers with refresh", async () => {
  const user = userEvent.setup();
  let fail = true;
  mockApi({
    "GET /notifications": () =>
      fail
        ? [500, { error: "Notifications unavailable" }]
        : [200, { notifications: [], unreadCount: 0 }],
  });
  render(<NotificationCenter />);
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Notifications unavailable",
  );
  fail = false;
  await user.click(
    screen.getByRole("button", { name: "Refresh notifications" }),
  );
  expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

it("closes the panel on a click outside it", async () => {
  const user = userEvent.setup();
  mockApi({
    "GET /notifications": () => [
      200,
      { notifications: [notification], unreadCount: 1 },
    ],
  });
  render(
    <>
      <p>Outside</p>
      <NotificationCenter />
    </>,
  );
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  await user.click(await screen.findByText(notification.message));
  expect(screen.getByText(notification.message)).toBeInTheDocument();
  await user.click(screen.getByText("Outside"));
  expect(screen.queryByText(notification.message)).not.toBeInTheDocument();
});

it("preserves unread status when marking read fails", async () => {
  const user = userEvent.setup();
  mockApi({
    "GET /notifications": () => [
      200,
      { notifications: [notification], unreadCount: 1 },
    ],
    "PATCH /notifications/7": () => [500, { error: "Read update failed" }],
  });
  render(<NotificationCenter />);
  await screen.findByLabelText("1 unread");
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  await user.click(screen.getByRole("button", { name: "Mark as read" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Read update failed",
  );
  expect(screen.getByLabelText("1 unread")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark as read" })).toBeEnabled();
});
