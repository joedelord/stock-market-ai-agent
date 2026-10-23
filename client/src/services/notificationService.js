import api from "./api";

export async function getNotifications({ signal } = {}) {
  const { data } = await api.get("/notifications", {
    params: { limit: 50 },
    signal,
  });
  return data;
}

export async function setNotificationRead(id, read) {
  const { data } = await api.patch(`/notifications/${encodeURIComponent(id)}`, {
    read,
  });
  return data.notification;
}

export async function markAllNotificationsRead() {
  await api.patch("/notifications", { read: true });
}
