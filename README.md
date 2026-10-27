# Stock Market AI Agent

Full-stack stock market application built with React, Node.js and
PostgreSQL. Users follow stocks on a watchlist, see intraday price charts,
ask an AI model ([Groq](https://groq.com)) to explain recent price movement,
and get notified when price alerts trigger. Market data comes from
[Twelve Data](https://twelvedata.com).

The project started from a React + Node + PostgreSQL authentication
template, so it also includes user accounts, roles, and admin tools.

## Status

Work in progress.

- Done: authentication, user management, stocks REST API, Twelve Data
  integration with a market-hours scheduler, stock dashboard with charts,
  AI stock analysis, watchlists, price alerts with in-app and email
  notifications, email verification, market holidays and early closes in
  the scheduler, admin-only stock creation.
- Not yet done: a production email provider, a stock search UI.

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
│   ├── services/              Twelve Data and Groq clients, stock metrics,
│   │                          alert checks, user logic
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

The server refuses to start if `JWT_SECRET` or the database settings are
missing. `TWELVE_DATA_API_KEY` is only needed to fetch market data.
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
| `/account`          | logged in       | Profile and account details           |
| `/account/password` | logged in       | Change password                       |
| `/admin`            | moderator/admin | User management                       |

Logged-in pages share a header with navigation, the notification bell and
an account menu (profile, password, administration, log out). Registration
leads to `/stocks`. Login leads back to the page the user tried to open, or
to `/stocks`.
The old `/dashboard` path redirects to `/stocks`.

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
| GET    | `/api/stocks/:id`          | Get one stock                   |
| GET    | `/api/stocks/:id/prices`   | Get a stock and its latest bars |
| POST   | `/api/stocks/:id/analysis` | AI analysis (login required)    |
| POST   | `/api/stocks`              | Add a stock (admin only)        |

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
default `all`) and returns `{ gainers, losers, mostFollowed, generatedAt }`,
up to five stocks each:

- **Gainers and losers** rank the stored quotes' day change. Only quotes
  from each exchange's latest stored trading day count, so a stale quote
  never ranks next to today's. Every row keeps its real `price_time`.
- **Most followed** lists stocks on at least two users' watchlists. The
  endpoint is public, and a count of one would show what a single user
  follows.
- Only supported exchanges (`XHEL`, `XNAS`, `XNYS`) are included, so mock
  stocks never appear.

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
shared by every user: guests get `401` and other roles get `403`.

## AI stock analysis

`POST /api/stocks/:id/analysis` explains a stock's recent price movement in
plain English:

1. Loads the latest 100 bars of `15min` prices.
2. Calculates metrics in
   [server/services/stockMetrics.js](server/services/stockMetrics.js):
   covered period, latest and period change, minimum and maximum close,
   SMA20 and SMA50 (`null` when there are too few points).
3. Sends the stock and metrics to Groq
   ([server/services/groqService.js](server/services/groqService.js)). The
   prompt allows only the supplied data: no news, predictions or buy/sell
   advice.

The response is `{ stock, metrics, analysis }`, where `analysis` has
`text`, `model` and `generatedAt`. Results are not cached.

Each user can request 10 analyses per 15 minutes. Errors:

| Status | Cause                                                        |
| ------ | ------------------------------------------------------------ |
| `404`  | Stock not found                                              |
| `409`  | Stock is inactive, so its prices are no longer updated       |
| `422`  | Fewer than two valid price points                            |
| `429`  | Too many analysis requests                                   |
| `502`  | Groq unreachable, or returned an error or incomplete answer  |
| `503`  | AI not configured, or Groq is busy (sent with `Retry-After`) |
| `504`  | Groq did not answer within 30 seconds                        |

Groq's own error details go to the server log only.

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

# Fetch the latest 15-minute bars for AAPL and NOKIA
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
run only updates stocks on the exchanges that are open at that time. One
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
| PATCH  | `/api/auth/password`            | Change the password          |
| POST   | `/api/auth/forgot-password`     | Request a password reset     |
| POST   | `/api/auth/reset-password`      | Set a new password by token  |
| POST   | `/api/auth/verify-email`        | Verify the email by token    |
| POST   | `/api/auth/resend-verification` | Send a new verification link |

Reset links point to `CLIENT_ORIGIN/reset-password?token=...`, expire after
one hour, and work once.

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
Registration, password reset requests, password changes, email
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

## Production checklist

- Set `NODE_ENV=production` and use HTTPS
- Use a strong, unique `JWT_SECRET`
- Use production PostgreSQL credentials and production Twelve Data and
  Groq keys
- Set `CLIENT_ORIGIN` to the real frontend domain
- Check cookie settings and the `trust proxy` setting
- Point the `SMTP_*` variables at a real email provider
- Run `npm run market:watch` as a long-running process next to the server
- Add next year's holidays to `server/config/marketCalendar.js` each autumn
- Run both test suites and the frontend production build
- Keep `.env` files out of Git
