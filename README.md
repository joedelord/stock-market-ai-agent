# Stock Market AI Agent

Full-stack stock market application built with React, Node.js and
PostgreSQL. It stores stocks and their price history, fetches market data
from [Twelve Data](https://twelvedata.com), and is the base for an AI agent
that analyses the market.

The project started from a React + Node + PostgreSQL authentication
template, so it also includes user accounts, roles, and admin tools.

## Status

Work in progress.

- Done: authentication, user management, stocks database schema, stocks
  REST API.
- In progress: market data integration (Twelve Data client, price import
  script and scheduler).
- Planned: AI agent.

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
- Twelve Data API for market data
- Vitest, Supertest

## Project structure

```text
stock-market-ai-agent/
├── client/                    React frontend (Vite)
│   └── src/
│       ├── components/        Shared UI, route guards, admin components
│       ├── context/           Authentication state
│       ├── pages/             Login, register, dashboard, admin, ...
│       ├── services/          Axios API client and error helpers
│       └── test/              Test setup and API mocks
│
├── server/                    Express API
│   ├── config/                Environment, database pool, exchange mapping
│   ├── controllers/           Request handlers (auth, users, stocks)
│   ├── middleware/            Auth, validation, rate limits, logging, errors
│   ├── migrations/            SQL migrations, run in file name order
│   ├── models/                SQL queries
│   ├── routes/                Express routers
│   ├── scripts/               Migrations, admin creation, market data tools
│   ├── services/              Business logic and the Twelve Data client
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
```

Other options:

- `DATABASE_URL` can replace the `DB_*` variables, for hosted PostgreSQL
  providers that give a single connection string.
- `DB_SSL=true` enables SSL. Set `DB_SSL_REJECT_UNAUTHORIZED=false` only
  for providers that use self-signed certificates.
- `LOG_LEVEL` sets the log level (`debug`, `info`, `warn`, `error` or
  `silent`).

The server refuses to start if `JWT_SECRET` or the database settings are
missing. `TWELVE_DATA_API_KEY` is only needed by the market data service.

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

The Vite development server forwards `/api` requests to the backend.

## Stocks API

| Method | Endpoint                 | Description                     |
| ------ | ------------------------ | ------------------------------- |
| GET    | `/api/stocks`            | List stocks, sorted by name     |
| GET    | `/api/stocks/:id`        | Get one stock                   |
| GET    | `/api/stocks/:id/prices` | Get a stock and its latest bars |
| POST   | `/api/stocks`            | Add a stock                     |

`GET /api/stocks/:id/prices` takes a `limit` query parameter (1–1000,
default 100). It returns the newest prices in oldest-first order, ready for
charting:

```json
{
  "stock": { "id": 1, "symbol": "NOKIA", "exchange": "XHEL", "...": "..." },
  "prices": [
    {
      "price_time": "...",
      "interval_code": "1day",
      "open": "...",
      "high": "...",
      "low": "...",
      "close": "...",
      "volume": "..."
    }
  ]
}
```

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
exists on that exchange.

> `POST /api/stocks` has no authentication yet. Protect it before
> deploying.

## Market data

`server/services/marketDataService.js` wraps the Twelve Data API:

- `fetchStockPrices({ symbol, exchange, interval, outputSize })` fetches
  OHLCV bars (default 30 bars of `15min`, UTC times).
- `searchStocks(query)` searches symbols and company names.

Exchanges are stored as MIC codes, which
`server/config/exchangeMapping.js` maps to Twelve Data exchange names.
Supported exchanges:

| MIC    | Twelve Data | Exchange        |
| ------ | ----------- | --------------- |
| `XHEL` | `OMXH`      | Nasdaq Helsinki |
| `XNAS` | `NASDAQ`    | Nasdaq (US)     |
| `XNYS` | `NYSE`      | New York (NYSE) |

Add a line to `PROVIDER_EXCHANGES` to support another exchange.

Try the integration from `server/`:

```bash
# Search for a symbol
node scripts/searchStocks.js NOKIA

# Fetch the latest 15-minute bars for AAPL and NOKIA
node scripts/testMarketData.js

# Fetch and save the latest 15-minute bars for every active stock, once
npm run market:once

# Keep running and update prices on a schedule
npm run market:watch
```

Both wait 8 seconds between stocks to stay within the free plan's limit of
8 requests per minute. One failing stock does not stop the others.
`market:once` prints a result per stock and exits with code 1 if any
failed.

`market:watch` ([server/marketScheduler.js](server/marketScheduler.js))
updates once at startup, then every 15 minutes on weekdays between 07:00
and 21:59 UTC, which covers Helsinki and New York trading hours. That is 60
runs a day with one request per active stock, so the free plan's 800
requests per day covers about 13 stocks. On `SIGTERM` or `SIGINT` it
finishes the current stock, closes the database pool and exits.

Free Twelve Data keys have a per-minute request limit, and some exchanges
need a paid plan.

## Authentication and users

Authentication uses a JWT in an HttpOnly cookie. The frontend never stores
the token in `localStorage` or `sessionStorage`. The backend loads the user
on every request, so role changes and account deletions take effect
immediately. Logging out, or changing or resetting the password, ends the
session on every device.

### Auth endpoints

| Method | Endpoint                    | Description                  |
| ------ | --------------------------- | ---------------------------- |
| POST   | `/api/auth/register`        | Register a user              |
| POST   | `/api/auth/login`           | Log in                       |
| POST   | `/api/auth/logout`          | Log out                      |
| GET    | `/api/auth/me`              | Return the current user      |
| PATCH  | `/api/auth/password`        | Change the password          |
| POST   | `/api/auth/forgot-password` | Request a password reset     |
| POST   | `/api/auth/reset-password`  | Set a new password by token  |

Reset links point to `CLIENT_ORIGIN/reset-password?token=...`, expire after
one hour, and work once. Email delivery is a placeholder in
`server/utils/mailer.js` that prints the link to the console outside
production. Connect a real email provider before deploying.

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
Registration, password reset requests and password changes are limited
too. Counters are stored in PostgreSQL, so limits hold across server
instances. Rate limits are off when `NODE_ENV=test`.

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
infrastructure (health check, logging, errors) and the stocks API. The
tests do not call Twelve Data.

### Frontend

```bash
cd client
npm test
npm run test:watch
```

The suite covers route guards, the auth provider, login, registration,
password reset and admin components.

## npm scripts

| Location  | Command                | Description               |
| --------- | ---------------------- | ------------------------- |
| `client/` | `npm run dev`          | Start Vite                |
| `client/` | `npm run build`        | Production build          |
| `client/` | `npm run lint`         | ESLint                    |
| `client/` | `npm test`             | Run tests                 |
| `server/` | `npm run dev`          | Start with auto reload    |
| `server/` | `npm start`            | Start                     |
| `server/` | `npm run migrate`      | Run database migrations   |
| `server/` | `npm run create-admin` | Create an admin user      |
| `server/` | `npm run market:once`  | Update prices once        |
| `server/` | `npm run market:watch` | Update prices on schedule |
| `server/` | `npm test`             | Run tests                 |

## Production checklist

- Protect `POST /api/stocks` with authentication
- Set `NODE_ENV=production` and use HTTPS
- Use a strong, unique `JWT_SECRET`
- Use production PostgreSQL credentials and a production Twelve Data key
- Set `CLIENT_ORIGIN` to the real frontend domain
- Check cookie settings and the `trust proxy` setting
- Connect a real email provider in `server/utils/mailer.js`
- Run both test suites and the frontend production build
- Keep `.env` files out of Git
