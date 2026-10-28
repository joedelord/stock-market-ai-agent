const { getStockNews, clearStockNewsCache } = require("../services/stockNewsService");
const stock = { symbol: "AAPL", exchange: "XNAS", name: "Apple" };
const entity = { symbol: "AAPL", country: "us", type: "equity" };
let counter = 0;
let input;
let fetchMock;
const response = (data) => ({ ok: true, json: async () => ({ data }) });
const article = (overrides = {}) => ({
  title: "Company announcement", url: "https://example.com/news",
  source: "Example", published_at: input.dayMovement.priceTime,
  description: "A supplied summary", entities: [entity], ...overrides,
});

beforeEach(() => {
  clearStockNewsCache();
  input = { stock, dayMovement: {
    isSignificant: true,
    priceTime: new Date(Date.parse("2026-10-20T14:00:00Z") + counter++ * 1000).toISOString(),
  } };
  vi.stubEnv("MARKETAUX_API_KEY", "test-news-key");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("does not fetch below threshold or without a quote", async () => {
  for (const dayMovement of [null, { isSignificant: false }]) {
    expect((await getStockNews({ stock, dayMovement })).status).toBe("not_requested");
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
test("reports missing configuration", async () => {
  vi.stubEnv("MARKETAUX_API_KEY", "");
  expect((await getStockNews(input)).status).toBe("not_configured");
  expect(fetchMock).not.toHaveBeenCalled();
});
test("resolves the company and uses an exact 72-hour quote window with cache", async () => {
  fetchMock.mockResolvedValueOnce(response([entity]))
    .mockResolvedValueOnce(response([article()]));
  const result = await getStockNews(input);
  expect(result.status).toBe("available");
  expect(result.articles[0]).toMatchObject({ title: "Company announcement", summary: "A supplied summary" });
  const url = fetchMock.mock.calls[1][0];
  expect(url.searchParams.get("symbols")).toBe("AAPL");
  expect(url.searchParams.get("published_before")).toBe(input.dayMovement.priceTime.slice(0, 19));
  expect(Date.parse(result.windowEnd) - Date.parse(result.windowStart)).toBe(72 * 3600000);
  expect(await getStockNews(input)).toEqual(result);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
test("discards post-quote, old, unrelated, duplicate and unsafe articles", async () => {
  const end = Date.parse(input.dayMovement.priceTime);
  fetchMock.mockResolvedValueOnce(response([entity])).mockResolvedValueOnce(response([
    article(), article(), article({url: "javascript:alert(1)"}),
    article({url: "https://example.com/future", published_at: new Date(end + 1000).toISOString()}),
    article({url: "https://example.com/old", published_at: new Date(end - 73 * 3600000).toISOString()}),
    article({url: "https://example.com/other", entities: [{symbol: "OTHER", country: "us"}]}),
  ]));
  expect((await getStockNews(input)).articles).toHaveLength(1);
});
test.each([[[]], [[entity, entity]], [[{...entity, country: "fi"}]]])("rejects missing or ambiguous identity %j", async (entities) => {
  fetchMock.mockResolvedValueOnce(response(entities));
  expect((await getStockNews(input)).status).toBe("unsupported");
  expect(fetchMock).toHaveBeenCalledOnce();
});
test("can resolve a Helsinki ticker alias using Finnish entity metadata", async () => {
  input.stock = {symbol: "NOKIA", name: "Nokia", exchange: "XHEL"};
  const helsinki = {symbol: "NOKIA.HE", country: "fi", type: "equity"};
  fetchMock.mockResolvedValueOnce(response([helsinki])).mockResolvedValueOnce(response([]));
  expect((await getStockNews(input)).status).toBe("no_results");
  expect(fetchMock.mock.calls[1][0].searchParams.get("symbols")).toBe("NOKIA.HE");
  expect(fetchMock.mock.calls[0][0].searchParams.get("countries")).toBe("fi");
});
test("caches entity lookups across quote windows, including unresolved ones", async () => {
  fetchMock.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([entity]));
  expect((await getStockNews(input)).status).toBe("unsupported");
  input.dayMovement = { ...input.dayMovement, priceTime: new Date(Date.parse(input.dayMovement.priceTime) + 1000).toISOString() };
  expect((await getStockNews(input)).status).toBe("unsupported");
  expect(fetchMock).toHaveBeenCalledOnce();
});
test("numbers articles newest first for citations", async () => {
  const end = Date.parse(input.dayMovement.priceTime);
  fetchMock.mockResolvedValueOnce(response([entity])).mockResolvedValueOnce(response([
    article({url: "https://example.com/older", published_at: new Date(end - 3600000).toISOString()}),
    article(),
  ]));
  const { articles } = await getStockNews(input);
  expect(articles.map(({ number, url }) => [number, url])).toEqual([
    [1, "https://example.com/news"], [2, "https://example.com/older"],
  ]);
});
test("returns no_results and caches empty provider results", async () => {
  fetchMock.mockResolvedValueOnce(response([entity])).mockResolvedValueOnce(response([]));
  expect((await getStockNews(input)).status).toBe("no_results");
  await getStockNews(input);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
test.each(["network", "http", "malformed", "timeout"])("degrades safely on %s failure", async (kind) => {
  if (kind === "network" || kind === "timeout") {
    fetchMock.mockRejectedValue(new Error(kind));
  } else {
    fetchMock.mockResolvedValue(kind === "http" ? {ok: false} : response(null));
  }
  expect((await getStockNews(input)).status).toBe("unavailable");
});
