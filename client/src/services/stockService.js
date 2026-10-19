import api from "./api";

export async function getStocks({ signal } = {}) {
  const { data } = await api.get("/stocks", { signal });

  return data.stocks;
}

export async function getStockById(id, { signal } = {}) {
  const { data } = await api.get(`/stocks/${encodeURIComponent(id)}`, {
    signal,
  });

  return data.stock;
}

export async function getStockPrices(id, { limit, signal } = {}) {
  const { data } = await api.get(`/stocks/${encodeURIComponent(id)}/prices`, {
    params: { limit },
    signal,
  });

  return data;
}
