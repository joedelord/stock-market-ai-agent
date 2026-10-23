import api from "./api";

export async function getAlerts({ signal } = {}) {
  const { data } = await api.get("/alerts", { signal });
  return data.alerts;
}

export async function createAlert(rule) {
  const { data } = await api.post("/alerts", rule);
  return data.alert;
}

export async function updateAlert(id, rule) {
  const { data } = await api.patch(`/alerts/${encodeURIComponent(id)}`, rule);
  return data.alert;
}

export async function deleteAlert(id) {
  await api.delete(`/alerts/${encodeURIComponent(id)}`);
}
