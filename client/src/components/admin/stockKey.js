// Identifies a stock across Twelve Data search results and the app's catalog.
export const toStockKey = (stock) => `${stock.symbol}:${stock.exchange}`;
