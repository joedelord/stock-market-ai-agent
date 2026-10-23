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

export async function createStockAnalysis(id, { signal } = {}) {
  const { data } = await api.post(
    `/stocks/${encodeURIComponent(id)}/analysis`,
    {},
    { signal },
  );

  return data;
}

export async function getWatchlistStocks({ signal } = {}) {
  const { data } = await api.get("/me/stocks", { signal });

  return data.stocks;
}

export async function createWatchlistStock(stockId) {
  const { data } = await api.post("/me/stocks", { stockId });

  return data.stock;
}

export async function deleteWatchlistStock(stockId) {
  await api.delete(`/me/stocks/${encodeURIComponent(stockId)}`);
}
