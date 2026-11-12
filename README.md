# Stock Market AI Agent

Full-stack stock market application built with React, Node.js and
PostgreSQL. Users follow stocks on a watchlist, see intraday price charts,
ask an AI model ([Groq](https://groq.com)) to explain recent price movement,
and get notified when price alerts trigger. Market data comes from
[Twelve Data](https://twelvedata.com).

The app focuses on the US stock market (Nasdaq and NYSE), because Twelve
Data's Basic plan does not cover Nasdaq Helsinki. The Helsinki support is
still in the code and can be turned back on with `ENABLED_EXCHANGES`.

The project started from a React + Node + PostgreSQL authentication
template, so it also includes user accounts, roles, and admin tools.

## Status

Ready for a first release. Features:

- Authentication, email verification, password reset and user management
- Stocks REST API and admin-only stock creation with a Twelve Data search UI
- Twelve Data integration with a market-hours scheduler that knows market
  holidays and early closes
- Stock dashboard with charts, watchlists and AI stock analysis
- Price alerts with in-app notifications and email delivery through any
  SMTP provider or the Gmail API (see [Email](#email)), with one-click
  unsubscribe
- Health checks for the database and email delivery, and a daily cleanup
  of old data

## Tech stack

### Frontend

- React, Vite, React Router (`react-router`)
- Tailwind CSS
- Axios
- Vitest, React Testing Library, jsdom

### Backend

- Node.js, Express 5 (CommonJS)
- PostgreSQL with `pg`
- JWT (`jsonwebtoken`) in HttpOnly cookies, `bcryptjs`
- Zod validation
- Helmet, `express-rate-limit`
- pino logging
- `node-cron` for the market scheduler
- Twelve Data API for market data
- Groq API (OpenAI-compatible chat completions) for AI analysis
- Vitest, Supertest

## Project structure

```text
stock-market-ai-agent/
├── client/                    React frontend (Vite)
│   └── src/
│       ├── components/        Shared UI, route guards, stock chart, AI
│       │                      analysis, watchlist picker, notifications,
│       │                      alert and admin components
│       ├── context/           Authentication state
│       ├── pages/             Login, register, dashboard, stocks, alerts,
│       │                      admin, ...
│       ├── services/          Axios API clients and error helpers
│       └── test/              Test setup and API mocks
│
├── server/                    Express API
│   ├── config/                Environment, database pool, exchange mapping,
│   │                          market holiday calendar
│   ├── controllers/           Request handlers (auth, users, stocks,
│   │                          analysis, watchlist, alerts, notifications)
│   ├── jobs/                  Price update job and market scheduler
│   ├── middleware/            Auth, validation, rate limits, logging, errors
│   ├── migrations/            SQL migrations, run in file name order
│   ├── models/                SQL queries
│   ├── routes/                Express routers
│   ├── scripts/               Migrations, admin creation, market data and
│   │                          mock data tools
│   ├── services/              Twelve Data, Groq and Gmail API clients,
│   │                          email, stock metrics, alert checks, user logic
│   ├── tests/                 Vitest + Supertest integration tests
│   ├── utils/                 Logger, mailer, tokens, HTTP errors
│   ├── validations/           Zod schemas
│   ├── app.js
│   └── server.js
│
└── README.md
```

## Requirements

- Node.js (with built-in `fetch`, version 18 or later)
- npm
- PostgreSQL
- A Twelve Data API key for market data (a free key works)
- A Groq API key for AI analysis (a free key works)

## Installation

Install dependencies separately for the client and server:

```bash
cd client
npm install

cd ../server
npm install
```

## Environment variables

Copy `server/.env.example` to `server/.env` and fill in the values:

```env
NODE_ENV=development
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=stock_market_db

JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=1h
COOKIE_EXPIRES_IN_MS=3600000

CLIENT_ORIGIN=http://localhost:5173

TWELVE_DATA_API_KEY=your_twelve_data_api_key
ENABLED_EXCHANGES=XNAS,XNYS

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_REASONING_EFFORT=none
```

Other options:

- `DATABASE_URL` can replace the `DB_*` variables, for hosted PostgreSQL
  providers that give a single connection string.
- `DB_SSL=true` enables SSL. Set `DB_SSL_REJECT_UNAUTHORIZED=false` only
  for providers that use self-signed certificates.
- `LOG_LEVEL` sets the log level (`debug`, `info`, `warn`, `error` or
  `silent`).
- `GROQ_REASONING_EFFORT` is optional. `none` turns off reasoning so the
  answer fits the 500-token limit. Allowed values depend on the model, so
  leave it unset if unsure.
- `ENABLED_EXCHANGES` lists the MIC codes of the exchanges the app uses,
  separated by commas (default `XNAS,XNYS`). See
  [Enabled exchanges](#enabled-exchanges).
- `MAX_ACTIVE_STOCKS` caps the number of active stocks (default `20`).
  See [Active stock limit](#active-stock-limit).
- `MARKETAUX_API_KEY` is optional. It enables company news in the AI
  analysis for significant day moves; without it the analysis says news
  is not configured.

The server refuses to start if `JWT_SECRET` or the database settings are
missing, or if `ENABLED_EXCHANGES` contains an unknown code. With
`NODE_ENV=production` it also requires `CLIENT_ORIGIN`, `MAIL_FROM` and
either `SMTP_HOST` or the `GMAIL_*` variables, so email links and delivery
cannot fail silently. Setting only some of the `GMAIL_*` variables is an
error in every environment. `TWELVE_DATA_API_KEY` is only needed to fetch market data.
Without `GROQ_API_KEY` and `GROQ_MODEL` everything else works, and the
analysis endpoint returns `503`.

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Never commit `.env` files.

## Database

Create a PostgreSQL database, then run the migrations from `server/`:

```bash
npm run migrate
```

The migration runner records which files have run, so each migration runs
only once.

### Tables

| Table                   | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `users`                 | Accounts and roles                              |
| `password_reset_tokens` | One-time password reset links                   |
| `rate_limits`           | Rate limit counters shared by all instances     |
| `stocks`                | Tracked stocks, unique by `symbol` + `exchange` |
| `stock_prices`          | OHLCV price bars per stock and interval         |
| `stock_quotes`          | Latest quote and previous close per stock       |
| `user_stocks`           | Each user's watchlist                           |
| `stock_alerts`          | Users' price and day change alert rules         |
| `notifications`         | Messages created when an alert triggers         |
| `stock_analyses`        | AI analyses and the metrics and news they used  |

`stocks.exchange` holds the ISO 10383 MIC code of the exchange (for
example `XHEL`, `XNAS`, `XNYS`). `stock_prices` is unique by stock,
interval (`interval_code`, default `1day`) and `price_time`.

### Creating the first admin

Registration always creates `user` accounts. Create the first admin from
`server/`:

```bash
npm run create-admin
```

The script asks for a username, email, and password. When not running in a
terminal, pass the password in the `ADMIN_PASSWORD` environment variable.
Admins created this way start with a verified email address.

### Mock data

To try the dashboard, analysis and alerts without a Twelve Data key, seed
three mock stocks (`RISE`, `FALL`, `FLAT`) with 100 bars of 15-minute
prices and a quote each:

```bash
npm run seed:mock -- you@example.com
```

The email is optional and adds the stocks to that user's watchlist. Mock
stocks use the exchange code `MOCK`, so the scheduler never fetches them.
Running the script again replaces their prices with fresh timestamps.

## Development

Start the backend (http://localhost:5000):

```bash
cd server
npm run dev
```

Start the frontend in another terminal (http://localhost:5173):

```bash
cd client
npm run dev
```

The Vite development server forwards `/api` requests to the backend. Run
`npm run market:watch:dev` in a third terminal to keep prices up to date.
It restarts when server code changes, like `npm run dev`. Each restart runs
an update right away, which uses Twelve Data requests.

## Frontend pages

| Path                | Access          | Content                               |
| ------------------- | --------------- | ------------------------------------- |
| `/`                 | public          | Market movers and most followed       |
| `/stocks`           | logged in       | Watchlist, price chart, AI analysis   |
| `/alerts`           | logged in       | Create, edit, pause and delete alerts |
| `/account`          | logged in       | Profile, account details, deletion    |
| `/account/password` | logged in       | Change password                       |
| `/admin`            | moderator/admin | Users; adding stocks (admin only)     |
| `/privacy`          | public          | Privacy and terms of use              |

Logged-in pages share a header with navigation, the notification bell and
an account menu (profile, password, administration, log out). Registration
leads to `/stocks`. Login leads back to the page the user tried to open, or
to `/stocks`.
The old `/dashboard` path redirects to `/stocks`.

`/privacy` says what is stored, which outside services receive data and
that nothing in the app is investment advice. The footer and the
registration form link to it. To show a contact address on it, set
`VITE_CONTACT_EMAIL` when building the client (for Docker:
`docker build --build-arg VITE_CONTACT_EMAIL=privacy@yourdomain.com .`).
Update the page if you add services that receive user data. It names Google
(Gmail) as the email provider, so change that line if you send through
another provider.

On `/stocks` the user picks the stocks on their watchlist. The list shows
each stock's latest price and day change. The chart shows the selected
stock's closing prices for the latest trading day, by the exchange's local
date. The notification bell checks for new notifications every minute
while the tab is visible.

## Stocks API

| Method | Endpoint                   | Description                     |
| ------ | -------------------------- | ------------------------------- |
| GET    | `/api/stocks`              | List stocks, sorted by name     |
| GET    | `/api/stocks/overview`     | Public market overview          |
| GET    | `/api/stocks/search`       | Search Twelve Data (admin only) |
| GET    | `/api/stocks/catalog`      | Stocks with usage (admin only)  |
| GET    | `/api/stocks/:id`          | Get one stock                   |
| GET    | `/api/stocks/:id/prices`   | Get a stock and its latest bars |
| POST   | `/api/stocks/:id/analysis` | AI analysis (login required)    |
| POST   | `/api/stocks`              | Add a stock (admin only)        |
| DELETE | `/api/stocks/:id`          | Remove a stock (admin only)     |

`GET /api/stocks/:id/prices` takes a `limit` query parameter (1–1000,
default 100). It returns the newest prices in oldest-first order, ready for
charting, and the latest quote (`null` if there is none yet):

```json
{
  "stock": { "id": 1, "symbol": "NOKIA", "exchange": "XHEL", "...": "..." },
  "prices": [
    {
      "price_time": "...",
      "interval_code": "15min",
      "open": "...",
      "high": "...",
      "low": "...",
      "close": "...",
      "volume": "..."
    }
  ],
  "quote": {
    "price_time": "...",
    "close": "...",
    "previous_close": "...",
    "fetched_at": "..."
  }
}
```

`GET /api/stocks/overview` takes `market` (`all`, `us` or `helsinki`,
default `all`) and returns
`{ gainers, losers, mostFollowed, markets, generatedAt }`, up to five
stocks per list:

- **Gainers and losers** rank the stored quotes' day change. Only quotes
  from each exchange's latest stored trading day count, so a stale quote
  never ranks next to today's. Every row keeps its real `price_time`.
- **Most followed** lists stocks on at least two users' watchlists. The
  endpoint is public, and a count of one would show what a single user
  follows.
- Only enabled exchanges are included, so mock stocks and stocks on
  disabled exchanges never appear. `all` means every enabled exchange, and
  a market without enabled exchanges returns empty lists.
- `markets` lists the markets that have enabled exchanges (`["us"]` by
  default). The home page builds its market selector from it and hides
  the selector when there is only one market.

`POST /api/stocks` body:

```json
{
  "symbol": "NOKIA",
  "exchange": "XHEL",
  "name": "Nokia Oyj",
  "currency": "EUR"
}
```

`symbol`, `exchange` and `currency` are converted to upper case. The
response is `201` with the new stock, or `409` if the symbol already
exists on that exchange. Only admins can add stocks, because the catalog is
shared by every user: guests get `401` and other roles get `403`. An
exchange that is not enabled is rejected with `400`, and the message lists
the enabled exchanges. When the [active stock limit](#active-stock-limit)
is reached, the response is `400`.

### Adding stocks from Twelve Data

Admins add stocks on the `/admin` page: search by symbol or company name,
then click **Add** on a result. The page calls
`GET /api/stocks/search?q=nokia` (1–50 characters), which searches Twelve
Data's `/symbol_search` and returns `{ results }`:

```json
{
  "results": [
    {
      "symbol": "NOKIA",
      "exchange": "XHEL",
      "name": "Nokia Oyj",
      "currency": "EUR",
      "country": "Finland",
      "stockId": null
    }
  ]
}
```

- Only common stocks on enabled exchanges are returned, with the
  exchange as our MIC code. Twelve Data's own `mic_code` is not used,
  because Nasdaq stocks come back as `XNGS`, `XNMS` or `XNCM`.
- `stockId` is the stock's ID if it is already in the database, otherwise
  `null`.
- Each admin can search 30 times per 15 minutes, because every search uses
  the shared Twelve Data key.
- Errors: `503` without `TWELVE_DATA_API_KEY`, `502` if Twelve Data returns
  an error, `504` if it does not answer within 15 seconds.

A new stock gets prices only once someone follows it or creates an alert
on it, because the price job updates tracked stocks only.

### Managing stocks

The `/admin` page lists every stock in the app, with the number of
watchlists it is on and its active alerts, and a count against the limit
(for example "18 / 20 active stocks"). It comes from
`GET /api/stocks/catalog`, which returns
`{ stocks, limit: { active, max } }`; each stock has `follower_count` and
`active_alert_count`.

**Remove** calls `DELETE /api/stocks/:id`. Removing a stock deletes it for
every user, with its price history, quotes, AI analyses, watchlist entries
and alerts. Notifications that alerts already created keep their text. The
confirmation dialog says how many watchlists and alerts are affected.

### Active stock limit

`MAX_ACTIVE_STOCKS` (default `20`) caps the number of active stocks, so the
price job cannot use up the Twelve Data quota. Adding a stock beyond it is
rejected until an admin removes one. Concurrent additions are serialized
with a database lock, so they cannot exceed the limit.

The free Twelve Data plan allows about 800 requests a day. The scheduler
fetches each tracked stock every 15 minutes, about 27 times per US trading
day, plus an hourly quote (about 7 more):

```text
daily requests ≈ tracked stocks × 34
20 stocks × 34 ≈ 680 requests (fits within 800)
```

Raise the limit only with a paid plan, or when fewer stocks are followed
than are in the catalog. The server refuses to start if the value is not a
positive whole number.

## AI stock analysis

`POST /api/stocks/:id/analysis` explains a stock's recent price movement in
plain English:

1. Loads the latest 100 bars of `15min` prices.
2. Calculates metrics in
   [server/services/stockMetrics.js](server/services/stockMetrics.js):
   covered period, latest and period change, minimum and maximum close,
   SMA20 and SMA50 (`null` when there are too few points).
3. Compares the stored quote with the previous session close
   (`metrics.dayMovement`, `null` without a valid quote). The move is
   significant when it is at least twice the stock's typical daily move,
   estimated from up to 60 earlier days of bars, with a 1% minimum. With
   fewer than 10 days of history a fixed 3% is used instead.
4. For a significant move, fetches up to three company articles from
   Marketaux published in the 72 hours before the quote
   ([server/services/stockNewsService.js](server/services/stockNewsService.js)).
   Only XHEL, XNAS and XNYS listings are supported, and a ticker must match
   exactly one company. `news.status` says why there are no articles
   (`not_requested`, `not_configured`, `unsupported`, `unavailable` or
   `no_results`).
5. Sends the stock, metrics and news to Groq
   ([server/services/groqService.js](server/services/groqService.js)). The
   prompt allows only the supplied data, treats news as untrusted text, and
   bans predictions and buy/sell advice. The answer has four sections and
   may cite up to two of the supplied articles as `[1]`, `[2]`; a citation
   of an article that was not supplied is rejected.

The response is `{ stock, metrics, analysis, cached, stale, news }`, where
`analysis` has `sections`, `citedArticles`, `model` and `generatedAt`. An
analysis is stored in `stock_analyses` and reused for 30 minutes while its
exact Groq input is unchanged (`cached: true`).

When Groq is busy, the newest stored analysis of the stock from the last 6
hours is returned instead of a `503`, with `stale: true`. `metrics` and
`news` are then the ones that analysis was written from, so its numbers and
citations match.

An answer that cannot be used (a missing section, an unknown citation, or
JSON that Groq itself rejects) is requested once more before the request
fails. Each Groq call logs one line: `Groq analysis generated` with the
model, attempt, duration and token usage, or `Groq analysis attempt failed`
with the reason and `willRetry`. A stale fallback logs `Groq busy, returned
a stale analysis`.

`npm run eval:analysis` in `server/` runs fixed scenarios against the real
model and checks the answers: no advice or forecasts, no causes stated as
fact, no data described as live, no prompt text copied into the answer, and
every decimal and percentage matching a supplied value. Each request
reserves 500 output tokens of the free tier's 1000 a minute, so scenarios
run 30 seconds apart:

```bash
npm run eval:analysis -- --only=no-quote,news-available --verbose
```

Each user can request 10 analyses per 15 minutes. Errors:

| Status | Cause                                                        |
| ------ | ------------------------------------------------------------ |
| `404`  | Stock not found                                              |
| `409`  | Stock is inactive, so its prices are no longer updated       |
| `422`  | Fewer than two valid price points                            |
| `429`  | Too many analysis requests                                   |
| `502`  | Groq unreachable, returned an error, or two unusable answers |
| `503`  | AI not configured, or Groq busy and no stale analysis        |
| `504`  | Groq did not answer within 30 seconds                        |

A busy `503` is sent with `Retry-After` when Groq provides one. Groq's own
error details go to the server log only.

## Watchlist

All endpoints require login and act on the current user's list.

| Method | Endpoint             | Description                     |
| ------ | -------------------- | ------------------------------- |
| GET    | `/api/me/stocks`     | List the user's stocks          |
| POST   | `/api/me/stocks`     | Add a stock: `{ "stockId": 1 }` |
| DELETE | `/api/me/stocks/:id` | Remove a stock by its stock ID  |

Adding returns `201`, `200` if the stock was already on the list, or `404`
for an unknown or inactive stock. Removing returns `204`.

## Alerts and notifications

### Alerts

All endpoints require login and act on the current user's alerts.

| Method | Endpoint          | Description                    |
| ------ | ----------------- | ------------------------------ |
| GET    | `/api/alerts`     | List alerts                    |
| POST   | `/api/alerts`     | Create an alert                |
| PATCH  | `/api/alerts/:id` | Edit an alert, or pause/resume |
| DELETE | `/api/alerts/:id` | Delete an alert                |

`POST /api/alerts` body:

```json
{
  "stockId": 1,
  "alertType": "price_above",
  "threshold": 25.5,
  "repeatMode": "once"
}
```

| `alertType`          | Triggers when                             | `threshold`      |
| -------------------- | ----------------------------------------- | ---------------- |
| `price_above`        | Price is at or above the threshold        | Positive price   |
| `price_below`        | Price is at or below the threshold        | Positive price   |
| `daily_change_above` | Day change % is at or above the threshold | Positive percent |
| `daily_change_below` | Day change % is at or below the threshold | -100 to below 0  |

`repeatMode` is `once` (the default; the alert switches off after it
triggers) or `daily` (at most once per market day). `PATCH` takes either
the full rule (`alertType`, `threshold`, `repeatMode`, optional
`isActive`) or only `{ "isActive": false }` / `{ "isActive": true }` to
pause or resume. An edited or resumed alert can trigger again on the same
day.

### How alerts are checked

The price update job checks the alerts of every stock it processes, even
when that run's fetch failed. It uses the newer of the latest `15min` bar
and the stored quote. The day change uses the quote's previous close, and
only when the quote is from the same market day in the exchange's local
time zone. Triggering an alert and creating its notification happen in one
transaction, so concurrent runs cannot notify twice.

### Alert emails

A triggered alert emails its owner when the address is verified and alert
emails are on. Emails go out one at a time, so a burst of alerts does not hit
the provider's rate limit, and a run stops at the first rate limit (HTTP 429
from the Gmail API, SMTP 421 or 452). Each notification records its email
status (`none`, `pending`, `sent` or `failed`):

- A failed email stays `pending` and the scheduler retries it after each
  price update, at least 10 minutes after the last attempt.
- It becomes `failed` after 5 attempts, or when it is a day old.
- A run sends at most 100 emails, well under Gmail's daily limit of about
  500 for a personal account.
- An email still pending when the user turns alert emails off is dropped.

Users turn alert emails on or off in their profile. Each alert email has an
unsubscribe link in its footer (`CLIENT_ORIGIN/unsubscribe?token=...`, which
asks for confirmation because link scanners open every link) and
`List-Unsubscribe` headers, so Gmail shows its own one-click unsubscribe
button. The token is an HMAC of the user id signed with `JWT_SECRET`. It
does not expire, cannot be used to log in, and can only turn alert emails
off. Changing `JWT_SECRET` invalidates the links in earlier emails.

### Notifications

| Method | Endpoint                 | Description                             |
| ------ | ------------------------ | --------------------------------------- |
| GET    | `/api/notifications`     | Latest notifications and unread count   |
| PATCH  | `/api/notifications/:id` | Mark read or unread: `{ "read": true }` |
| PATCH  | `/api/notifications`     | Mark all read: `{ "read": true }`       |

`GET /api/notifications` takes `limit` (1–100, default 50) and returns
`{ notifications, unreadCount }`.

## Market data

`server/services/marketDataService.js` wraps the Twelve Data API:

- `fetchStockPrices({ symbol, exchange, interval, outputSize })` fetches
  OHLCV bars (default 30 bars of `15min`, UTC times).
- `fetchStockQuote({ symbol, exchange })` fetches the latest price and the
  previous close.
- `searchStocks(query)` searches symbols and company names.

Exchanges are stored as MIC codes, which
`server/config/exchangeMapping.js` maps to Twelve Data exchange names and
local time zones. Supported exchanges:

| MIC    | Twelve Data | Exchange        |
| ------ | ----------- | --------------- |
| `XHEL` | `OMXH`      | Nasdaq Helsinki |
| `XNAS` | `NASDAQ`    | Nasdaq (US)     |
| `XNYS` | `NYSE`      | New York (NYSE) |

### Enabled exchanges

`ENABLED_EXCHANGES` (default `XNAS,XNYS`) chooses which supported
exchanges are in use. Twelve Data's Basic plan does not cover Helsinki, so
`XHEL` is off by default. A disabled exchange is not updated by the
scheduler or `market:once`, does not appear in search results or the
market overview, and new stocks cannot be added to it. Stocks already in
the database stay there. To turn Helsinki back on with a plan that covers
it:

```env
ENABLED_EXCHANGES=XNAS,XNYS,XHEL
```

An unknown code, or a list without codes, stops the server and scripts at
startup with an error that names the supported codes.

Add a line to `PROVIDER_EXCHANGES` and `EXCHANGE_TIME_ZONES` to support
another exchange, to `MARKET_HOURS` in
[server/jobs/marketScheduler.js](server/jobs/marketScheduler.js) for the
scheduler to update it, and to `MARKET_CALENDAR` in
[server/config/marketCalendar.js](server/config/marketCalendar.js) for its
holidays.

Try the integration from `server/`:

```bash
# Search for a symbol
node scripts/searchStocks.js NOKIA

# Fetch the latest 15-minute bars for AAPL, IBM and NOKIA (enabled
# exchanges only)
node scripts/testMarketData.js

# Update every tracked stock once
npm run market:once

# Keep running and update prices on a schedule
npm run market:watch

# The same, restarting when server code changes
npm run market:watch:dev
```

Only tracked stocks are updated: active stocks that are on someone's
watchlist or have an active alert. For each one the job
([server/jobs/updateStockPrices.js](server/jobs/updateStockPrices.js))
saves the latest five `15min` bars, refreshes the quote if the stored one
is over an hour old, and checks the stock's alerts. It waits 8 seconds
between requests to stay within the free plan's limit of 8 requests per
minute. One failing stock does not stop the others. `market:once` prints a
result per stock and exits with code 1 if any price fetch failed.

`market:watch` ([server/scripts/startMarketScheduler.js](server/scripts/startMarketScheduler.js),
schedule in [server/jobs/marketScheduler.js](server/jobs/marketScheduler.js))
updates once at startup, then every 15 minutes on weekdays while New York
(09:30-16:00 local time) or Helsinki (10:00-18:30 local time) is open. Each
run only updates stocks on the enabled exchanges that are open at that
time, so with the default configuration Helsinki hours are skipped. One
more run 15 minutes after each close saves the last bar of the day.

Holidays and early closes come from
[server/config/marketCalendar.js](server/config/marketCalendar.js), listed
per exchange and year in the exchange's local dates. A US holiday only
stops Nasdaq and NYSE, and a Helsinki holiday only stops Helsinki. On an
early close (for example 13:00 on the day after Thanksgiving) the last run
is 15 minutes after the early close. If an exchange has no calendar for
the current year, the scheduler logs a warning once and uses normal hours.
A test fails when next year's calendar is missing, so add it each autumn
from the sources linked in the file.

A tracked stock costs about 35-45 requests a
day (one price request per run plus an hourly quote), so the free plan's
800 requests per day covers about 18 stocks. On `SIGTERM` or `SIGINT` it
finishes the current stock, closes the database pool and exits, or forces
an exit after 20 seconds.

The same process also cleans up old data every day at 03:00 UTC
([server/jobs/cleanupData.js](server/jobs/cleanupData.js)), when neither
market is open. It deletes notifications older than 90 days, password reset
and email verification tokens that have expired, and stock prices older
than 365 days. The AI analysis reads at most about 96 trading days of
prices, so a year of history is never missed. A failed cleanup is logged
and tried again the next day.

Free Twelve Data keys have a per-minute request limit, and some exchanges
need a paid plan.

## Authentication and users

Authentication uses a JWT in an HttpOnly cookie. The frontend never stores
the token in `localStorage` or `sessionStorage`. The backend loads the user
on every request, so role changes and account deletions take effect
immediately. Logging out, or changing or resetting the password, ends the
session on every device.

### Auth endpoints

| Method | Endpoint                        | Description                  |
| ------ | ------------------------------- | ---------------------------- |
| POST   | `/api/auth/register`            | Register a user              |
| POST   | `/api/auth/login`               | Log in                       |
| POST   | `/api/auth/logout`              | Log out                      |
| GET    | `/api/auth/me`                  | Return the current user      |
| DELETE | `/api/auth/me`                  | Delete the own account       |
| PATCH  | `/api/auth/password`            | Change the password          |
| POST   | `/api/auth/forgot-password`     | Request a password reset     |
| POST   | `/api/auth/reset-password`      | Set a new password by token  |
| POST   | `/api/auth/verify-email`        | Verify the email by token    |
| POST   | `/api/auth/resend-verification` | Send a new verification link |
| PATCH  | `/api/auth/me/email-preferences` | Turn alert emails on or off |
| POST   | `/api/auth/unsubscribe?token=`   | Turn alert emails off by link |

Deleting the own account needs the current password in the body
(`{ "password": "..." }`). It removes the user's watchlist, alerts,
notifications and tokens, ends every session, and refuses to delete the
last admin.

`PATCH /api/auth/me/email-preferences` takes `{ "emailAlertsEnabled": false }`
and returns the updated user. `POST /api/auth/unsubscribe` needs no login;
see [Alert emails](#alert-emails).

Reset links point to `CLIENT_ORIGIN/reset-password?token=...`, expire after
one hour, and work once. Changing the password, by reset link or on the
profile, cancels every pending reset link and emails the owner that the
password was changed.

Registering sends a verification link to
`CLIENT_ORIGIN/verify-email?token=...`, which expires after 24 hours and
works once. Unverified users can log in and use the app, and they see
in-app notifications, but alert emails only go to verified addresses.
Requesting a new link replaces the old one.

### Email

`server/services/emailService.js` sends email over SMTP using the `SMTP_*`
and `MAIL_FROM` variables. Locally, run [Mailpit](https://mailpit.axllent.org/)
(SMTP on port 1025, inbox at http://localhost:8025) and send one of each
email with `npm run email:test -- you@example.com`. Without `SMTP_HOST`,
development only logs emails. Tests never send email.

In production, use any transactional email provider that offers SMTP
(for example Resend, Postmark, Brevo or Amazon SES). Verify the sender
domain with the provider, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`
(`true` for port 465), `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`, and check
delivery with `npm run email:test -- you@example.com`. These providers cannot
send from a `@gmail.com` address, only from a domain you own.

Without a domain, a Gmail account works for small projects:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your.account@gmail.com
SMTP_PASS=your_16_char_app_password
MAIL_FROM="Stock Market AI <your.account@gmail.com>"
```

`SMTP_PASS` is an app password (turn on 2-Step Verification, then create one
at myaccount.google.com/apppasswords), not the account password. `MAIL_FROM`
must match `SMTP_USER`, or Gmail rewrites the sender. Gmail allows about 500
recipients a day.

#### Gmail API (hosts that block SMTP)

Some hosts block outgoing SMTP, for example Railway's Trial and Hobby plans.
Gmail's HTTPS API still works there. When `GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN` are all set, the server sends
through the Gmail API and ignores the `SMTP_*` variables. Nodemailer still
builds the messages, so no extra packages are needed.

One-time setup, signed in as the Gmail account that sends the email:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Gmail API** (APIs & Services → Library).
2. Configure the **OAuth consent screen** (Google Auth Platform): user type
   *External*, then under Audience click **Publish app** so the status is
   *In production*. In *Testing* status the refresh token expires after
   7 days. The app does not need Google's verification for your own account.
3. Under Clients, create an **OAuth client ID** of type *Web application* and
   add `https://developers.google.com/oauthplayground` as an authorized
   redirect URI. Copy the client ID and secret.
4. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground),
   click the gear icon, check *Use your own OAuth credentials* and paste the
   client ID and secret.
5. In Step 1, enter the scope `https://www.googleapis.com/auth/gmail.send`
   and click *Authorize APIs*. Sign in with the sending account. Google warns
   that the app is not verified: choose *Advanced* → *Go to … (unsafe)*.
6. In Step 2, click *Exchange authorization code for tokens* and copy the
   refresh token.
7. Set the variables in `server/.env` locally, or in the host's environment
   variables in production:

   ```env
   GMAIL_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=GOCSPX-...
   GMAIL_REFRESH_TOKEN=1//0g...
   MAIL_FROM="Stock Market AI <your.account@gmail.com>"
   ```

8. Check delivery with `npm run email:test -- you@example.com`.

`MAIL_FROM` must be the account that authorized the token, or Gmail replaces
the sender. The refresh token stops working if the account password changes
or the access is removed from the Google account. Sending then fails with
`invalid_grant` in the server logs, and steps 4–7 give a new token. The same
limit of about 500 recipients a day applies.

### Roles and user endpoints

Roles: `user`, `moderator`, `admin`.

| Method | Endpoint              | Access           |
| ------ | --------------------- | ---------------- |
| GET    | `/api/users`          | moderator, admin |
| GET    | `/api/users/:id`      | moderator, admin |
| POST   | `/api/users`          | admin            |
| PATCH  | `/api/users/:id/role` | admin            |
| DELETE | `/api/users/:id`      | admin            |

`GET /api/users` is paginated with `page` (default 1) and `pageSize`
(default 20, max 100). Only admins see email addresses. Admins cannot
change their own role or delete themselves, and the last admin cannot be
demoted or deleted.

### Rate limits

Login is limited per IP address and, for failed attempts, per email.
Registration, password reset requests, password changes, account deletion, email
verification and AI analysis are limited too. Counters are stored in
PostgreSQL, so limits hold across
server instances. Rate limits are off when `NODE_ENV=test`.

## Other server features

- **Validation:** Zod checks every request before it reaches a controller.
  Invalid input returns `400`. Errors are always `{ "error": "..." }`.
- **Logging:** pino, pretty in development, JSON otherwise, silent in
  tests. Each request gets an `X-Request-Id`. Cookies and authorization
  headers are never logged.
- **Health check:** `GET /api/health` returns `{"status":"ok"}`, or `503`
  when the database is unreachable.
- **Email health check:** `GET /api/health/email` returns `ok`,
  `not_configured` or, with `503`, `failing`. It requests a Gmail access
  token (or opens an SMTP connection), so it catches a revoked refresh token.
  The result is reused for 5 minutes. A Gmail access token that was fetched
  before the refresh token was revoked keeps working for up to an hour, so
  the check can take that long to notice. In production the server also
  runs this check at startup and logs the result.
- **Shutdown:** on `SIGTERM`/`SIGINT` the server finishes open requests,
  closes the database pool and exits (forced after 10 seconds).
- **Proxy:** in production Express trusts the first reverse proxy
  (`trust proxy` = 1). Review this for your hosting setup.

## Testing

### Backend

Backend tests use Vitest and Supertest against a separate PostgreSQL test
database. Test files run one at a time and share the database.

Create `server/.env.test`:

```env
NODE_ENV=test

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=stock_market_test_db

JWT_SECRET=test-secret-key-only-for-tests
JWT_EXPIRES_IN=1h
COOKIE_EXPIRES_IN_MS=3600000
```

`server/tests/setup.js` sets `ENABLED_EXCHANGES=XNAS,XNYS,XHEL`, so the
Helsinki tests keep running. Tests for the default US-only configuration
use `useUsExchangesOnly()` from `server/tests/helpers/exchanges.js`.

Create the database and run the migrations against it (PowerShell):

```powershell
$env:NODE_ENV="test"
npm run migrate
Remove-Item Env:NODE_ENV
```

Run the tests from `server/`:

```bash
npm test
npm run test:watch
```

The suite covers authentication, passwords, rate limits, user management,
infrastructure (health check, logging, errors), the stocks API, stock
metrics and AI analysis, the market data client, the price update job and
scheduler, watchlists, alerts, alert triggering and notifications. The
tests never call Twelve Data or Groq; those requests are mocked.

### Frontend

```bash
cd client
npm test
npm run test:watch
```

The suite covers route guards, the auth provider, login, registration,
password reset, admin components, the stock dashboard, chart and analysis,
the alerts page and the notification center.

## npm scripts

| Location  | Command                    | Description                |
| --------- | -------------------------- | -------------------------- |
| `client/` | `npm run dev`              | Start Vite                 |
| `client/` | `npm run build`            | Production build           |
| `client/` | `npm run lint`             | ESLint                     |
| `client/` | `npm test`                 | Run tests                  |
| `server/` | `npm run dev`              | Start with auto reload     |
| `server/` | `npm start`                | Start                      |
| `server/` | `npm run migrate`          | Run database migrations    |
| `server/` | `npm run create-admin`     | Create an admin user       |
| `server/` | `npm run market:once`      | Update prices once         |
| `server/` | `npm run market:watch`     | Update prices on schedule  |
| `server/` | `npm run market:watch:dev` | Same, with auto reload     |
| `server/` | `npm run seed:mock`        | Add mock stocks and prices |
| `server/` | `npm test`                 | Run tests                  |

## Deployment

The production setup runs everything from one origin: Express serves the
built client from `client/dist` when `SERVE_CLIENT=true`, and every path
that is not under `/api` falls back to `index.html` for React Router. This
keeps the `SameSite=Lax` session cookie working without CORS.
`CLIENT_DIST_DIRECTORY` overrides the build location.

The app needs three processes, all from the same code:

| Process   | Command                | Runs                        |
| --------- | ---------------------- | --------------------------- |
| Web       | `npm start`            | Always                      |
| Scheduler | `npm run market:watch` | Always, exactly one copy    |
| Migrate   | `npm run migrate`      | Before each release (once)  |

Run only one scheduler, or the same prices are fetched twice and Twelve
Data credits run out sooner.

### Docker

The `Dockerfile` builds the client and a production server image with
`NODE_ENV=production` and `SERVE_CLIENT=true`. Its default command starts
the web server; override the command for the scheduler and migrations.

`docker-compose.yml` runs PostgreSQL, migrations, the web server
(http://localhost:5000) and the scheduler, with the other settings from
`server/.env`:

```bash
docker compose up --build
docker compose run --rm web npm run create-admin
```

On a hosting platform that builds from a Dockerfile, create one web
service and one worker (`npm run market:watch`) from this image, run
`npm run migrate` as the release or pre-deploy command, and use the
platform's PostgreSQL with `DATABASE_URL` (and `DB_SSL=true` if required).
Point the platform's health check at `/api/health`. To hear about broken
email, point an uptime monitor (for example UptimeRobot) at
`/api/health/email`. It is kept separate so an email outage never fails a
deploy.

### Without Docker

```bash
cd client && npm ci && npm run build
cd ../server && npm ci --omit=dev
NODE_ENV=production SERVE_CLIENT=true npm start
```

## Production checklist

- Set `NODE_ENV=production` and use HTTPS
- Use a strong, unique `JWT_SECRET`
- Use production PostgreSQL credentials and production Twelve Data and
  Groq keys
- Set `CLIENT_ORIGIN` to the real frontend domain
- Check cookie settings and the `trust proxy` setting
- Point the `SMTP_*` variables at a real email provider, or set the
  `GMAIL_*` variables if the host blocks SMTP
- Set `SERVE_CLIENT=true` (the Docker image does this)
- Run `npm run migrate` before starting a new version
- Run `npm run market:watch` as a long-running process next to the server
- Add next year's holidays to `server/config/marketCalendar.js` each autumn
- Run both test suites and the frontend production build
- Keep `.env` files out of Git
