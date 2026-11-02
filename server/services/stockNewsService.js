const MARKETAUX_URL = "https://api.marketaux.com";
const REQUEST_TIMEOUT_MS = 10_000;
const LOOKBACK_MS = 72 * 60 * 60 * 1000;
const NEWS_CACHE_TTL_MS = 15 * 60 * 1000;
// Ticker-to-entity mappings rarely change, and the free tier only allows
// about 100 requests a day, so lookups are cached much longer than news.
const ENTITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const MAX_ARTICLES = 3;
const MAX_TITLE_LENGTH = 300;
const MAX_SOURCE_LENGTH = 150;
const MAX_SUMMARY_LENGTH = 1000;
const COUNTRY_BY_EXCHANGE = { XHEL: "fi", XNAS: "us", XNYS: "us" };

const newsCache = new Map();
const entityCache = new Map();

const getCached = (cache, key) => {
  const entry = cache.get(key);
  return entry && entry.expiresAt > Date.now() ? entry : null;
};

// Caches hold public data only, never credentials.
const setCached = (cache, key, value, ttlMs) => {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

const clearStockNewsCache = () => {
  newsCache.clear();
  entityCache.clear();
};

const request = async (path, params, apiKey, signal) => {
  const url = new URL(path, MARKETAUX_URL);
  Object.entries({ ...params, api_token: apiKey }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("News provider unavailable");

  const body = await response.json();
  if (!Array.isArray(body?.data)) throw new Error("Invalid news response");

  return body.data;
};

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    const isWebUrl = ["https:", "http:"].includes(url.protocol);
    return isWebUrl && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

// Returns null when no single equity matches, because an ambiguous or absent
// mapping must not become guessed company news.
const resolveEntitySymbol = async (stock, country, apiKey, signal) => {
  const key = JSON.stringify([stock.symbol, stock.exchange]);
  const cached = getCached(entityCache, key);
  if (cached) return cached.value;

  const entities = await request(
    "/v1/entity/search",
    { search: stock.symbol, countries: country },
    apiKey,
    signal,
  );

  const symbols = new Set([stock.symbol.toUpperCase()]);
  if (stock.exchange === "XHEL") symbols.add(`${stock.symbol.toUpperCase()}.HE`);

  const matches = entities.filter(
    (entity) =>
      entity.type === "equity" &&
      entity.country === country &&
      typeof entity.symbol === "string" &&
      symbols.has(entity.symbol.toUpperCase()),
  );

  const symbol = matches.length === 1 ? matches[0].symbol : null;
  setCached(entityCache, key, symbol, ENTITY_CACHE_TTL_MS);

  return symbol;
};

const toArticles = (rows, symbol, country, start, end) => {
  const seen = new Set();

  const articles = rows.flatMap((row) => {
    const time =
      typeof row.published_at === "string" ? Date.parse(row.published_at) : NaN;
    const url = safeUrl(row.url);
    const isRelevant = row.entities?.some(
      (entity) => entity.symbol === symbol && entity.country === country,
    );

    if (
      !url ||
      seen.has(url) ||
      !isRelevant ||
      !Number.isFinite(time) ||
      time < start ||
      time > end ||
      typeof row.title !== "string" ||
      !row.title.trim()
    ) {
      return [];
    }

    seen.add(url);

    return [
      {
        title: row.title.trim().slice(0, MAX_TITLE_LENGTH),
        url,
        source:
          typeof row.source === "string"
            ? row.source.slice(0, MAX_SOURCE_LENGTH)
            : new URL(url).hostname,
        publishedAt: new Date(time).toISOString(),
        summary:
          typeof row.description === "string"
            ? row.description.slice(0, MAX_SUMMARY_LENGTH)
            : "",
      },
    ];
  });

  // The number lets the model cite [1], [2], [3] matching the UI list order.
  return articles
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_ARTICLES)
    .map((article, index) => ({ number: index + 1, ...article }));
};

const getStockNews = async ({ stock, dayMovement }) => {
  const base = { provider: "marketaux", articles: [] };

  if (!dayMovement?.isSignificant) return { ...base, status: "not_requested" };

  const apiKey = process.env.MARKETAUX_API_KEY?.trim();
  if (!apiKey) return { ...base, status: "not_configured" };

  const country = COUNTRY_BY_EXCHANGE[stock.exchange];
  if (!country) return { ...base, status: "unsupported" };

  const end = new Date(dayMovement.priceTime).getTime();
  if (!Number.isFinite(end)) return { ...base, status: "unavailable" };

  const start = end - LOOKBACK_MS;
  const window = {
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(end).toISOString(),
  };

  const key = JSON.stringify([stock.symbol, stock.exchange, end]);
  const cached = getCached(newsCache, key);
  if (cached) return cached.value;

  try {
    // A single timeout covers entity resolution, news fetch and body reads.
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    const symbol = await resolveEntitySymbol(stock, country, apiKey, signal);
    if (!symbol) return { ...base, ...window, status: "unsupported" };

    const rows = await request(
      "/v1/news/all",
      {
        symbols: symbol,
        countries: country,
        filter_entities: "true",
        must_have_entities: "true",
        group_similar: "true",
        limit: String(MAX_ARTICLES),
        published_after: window.windowStart.slice(0, 19),
        published_before: window.windowEnd.slice(0, 19),
      },
      apiKey,
      signal,
    );

    const articles = toArticles(rows, symbol, country, start, end);
    const value = {
      ...base,
      ...window,
      status: articles.length ? "available" : "no_results",
      articles,
    };

    setCached(newsCache, key, value, NEWS_CACHE_TTL_MS);

    return value;
  } catch {
    // News failure should not prevent analysis of valid price history.
    return { ...base, ...window, status: "unavailable" };
  }
};

module.exports = {
  getStockNews,
  clearStockNewsCache,
};
