import { useEffect, useState } from "react";
import { Link } from "react-router";

import AppHeader from "../components/AppHeader";
import PublicHeader from "../components/PublicHeader";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../services/errors";
import { getMarketOverview } from "../services/stockService";

function formatTime(value) {
  if (!value) return "No quote available";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  }).format(new Date(value));
}

function formatPrice(stock) {
  if (stock.close == null) return "—";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: stock.currency,
  }).format(Number(stock.close));
}

function toChange(stock) {
  return stock.day_change_percent == null
    ? null
    : Number(stock.day_change_percent);
}

function formatChange(change) {
  if (change == null) return "—";

  return `${change > 0 ? "+" : ""}${change.toFixed(2)} %`;
}

function getChangeColor(change) {
  if (change > 0) return "text-green-700";
  if (change < 0) return "text-red-700";
  return "text-gray-500";
}

function MarketStock({ stock, popular }) {
  const change = toChange(stock);

  return (
    <li>
      <div className="market-stock-top">
        <div>
          <strong>{stock.symbol}</strong>
          <span className="market-exchange">{stock.exchange}</span>
        </div>

        {popular ? (
          <strong className="text-blue-700">
            {stock.follower_count} following
          </strong>
        ) : (
          <strong className={getChangeColor(change)}>
            {formatChange(change)}
          </strong>
        )}
      </div>

      <div className="market-stock-bottom">
        <span>{stock.name}</span>
        <span>{formatPrice(stock)}</span>
      </div>

      <p className="market-quote-time">
        Quote: {formatTime(stock.price_time)}
        {stock.price_time && " · Helsinki"}
      </p>
    </li>
  );
}

function MarketCard({ title, description, stocks, emptyText, popular = false }) {
  return (
    <section className="market-card" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>

      {stocks.length === 0 ? (
        <p className="market-empty">{emptyText}</p>
      ) : (
        <ol className="market-stock-list">
          {stocks.map((stock) => (
            <MarketStock key={stock.id} stock={stock} popular={popular} />
          ))}
        </ol>
      )}
    </section>
  );
}

function MarketHero({ isAuthenticated }) {
  return (
    <section className="market-hero">
      <div>
        <p className="workspace-eyebrow">MARKET OVERVIEW</p>
        <h1>
          Your market.
          <br />
          <span>At a glance.</span>
        </h1>
        <p>
          Discover the movers. Follow your favourites.
          <br />
          Build a clearer picture with AI.
        </p>
      </div>

      <div className="hero-workspace-card">
        <span className="workspace-eyebrow">MAKE IT YOURS</span>
        <h2>A watchlist built around you.</h2>
        <p>
          Track stocks, set price alerts and explore AI summaries in your
          personal workspace.
        </p>
        <Link
          className="account-primary-link"
          to={isAuthenticated ? "/stocks" : "/register"}
        >
          {isAuthenticated ? "Open my stocks" : "Create your watchlist"}{" "}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

function MarketToolbar({ market, onMarketChange, onRefresh, isLoading }) {
  return (
    <div className="market-toolbar">
      <div>
        <h2 id="market-heading">Market snapshot</h2>
        <p>Stocks available in this app · Stored quotes, not a live feed</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="market-filter">
          Market
        </label>
        <select
          id="market-filter"
          value={market}
          onChange={(event) => onMarketChange(event.target.value)}
        >
          <option value="all">All markets</option>
          <option value="us">USA</option>
          <option value="helsinki">Helsinki</option>
        </select>

        <button
          type="button"
          disabled={isLoading}
          onClick={onRefresh}
          className="market-refresh"
        >
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

function Home() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [market, setMarket] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await getMarketOverview(market, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) setData(result);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            getErrorMessage(
              err,
              "Market overview is unavailable. Please try again.",
            ),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [market, reload]);

  // A refresh keeps the current lists visible; another market's lists don't
  // belong on screen.
  function handleMarketChange(nextMarket) {
    setData(null);
    setMarket(nextMarket);
  }

  return (
    <div className="app-shell">
      {isAuthenticated && !authLoading ? (
        <AppHeader />
      ) : (
        <PublicHeader isLoading={authLoading} />
      )}

      <main id="main-content" className="market-home">
        <MarketHero isAuthenticated={isAuthenticated} />

        <section
          className="market-overview"
          aria-labelledby="market-heading"
          aria-busy={loading}
        >
          <MarketToolbar
            market={market}
            onMarketChange={handleMarketChange}
            onRefresh={() => setReload((value) => value + 1)}
            isLoading={loading}
          />

          <p className="market-data-note">
            Gainers and losers compare each exchange’s latest available trading
            day with its previous close. Quotes may be delayed or from an
            earlier date; see each row’s timestamp. Most followed counts stocks
            on at least two users’ watchlists.
          </p>

          {loading && !data && (
            <p role="status" className="market-loading">
              Loading market overview…
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"
            >
              {error}
            </p>
          )}

          {data && (
            <>
              <div className="market-grid">
                <MarketCard
                  title="Top gainers"
                  description="Largest positive daily changes"
                  stocks={data.gainers}
                  emptyText="No matching quotes for the latest available trading day."
                />
                <MarketCard
                  title="Top losers"
                  description="Largest negative daily changes"
                  stocks={data.losers}
                  emptyText="No matching quotes for the latest available trading day."
                />
                <MarketCard
                  title="Most followed"
                  description="Popular across users’ watchlists"
                  stocks={data.mostFollowed}
                  emptyText="No stock in this market is followed by two or more users yet."
                  popular
                />
              </div>

              <p className="market-data-note">
                Snapshot loaded: {formatTime(data.generatedAt)} · Helsinki. The
                quote times above indicate the age of the prices.
              </p>
            </>
          )}
        </section>

        {!authLoading && !isAuthenticated && (
          <section className="market-join">
            <div>
              <h2>Keep your favourites in focus.</h2>
              <p>
                Create your watchlist and set alerts for the moves that matter.
              </p>
            </div>
            <Link to="/register" className="account-primary-link">
              Create account →
            </Link>
          </section>
        )}
      </main>

      <footer className="app-footer">
        Stock Market AI · Your personal market workspace
      </footer>
    </div>
  );
}

export default Home;
