const path = require("path");
const dotenv = require("dotenv");

const { getEnabledExchanges } = require("./exchangeMapping");
const { getMaxActiveStocks } = require("./stockLimit");

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";

dotenv.config({
  path: path.resolve(process.cwd(), envFile),
});

const isProduction = process.env.NODE_ENV === "production";

// Production has no default, so email links never point at localhost.
if (!isProduction) {
  process.env.CLIENT_ORIGIN ??= "http://localhost:5173";
}

const DATABASE_VARIABLES = process.env.DATABASE_URL
  ? []
  : ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];

// Without these, verification, password reset and alert emails would only
// fail later, one request at a time.
const PRODUCTION_VARIABLES = isProduction
  ? ["CLIENT_ORIGIN", "SMTP_HOST", "MAIL_FROM"]
  : [];

const REQUIRED_VARIABLES = [
  ...DATABASE_VARIABLES,
  "JWT_SECRET",
  ...PRODUCTION_VARIABLES,
];

const missingVariables = REQUIRED_VARIABLES.filter(
  (name) => !process.env[name],
);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables in ${envFile}: ${missingVariables.join(", ")}`,
  );
}

// Fails at startup instead of on the first scheduler run or request.
getEnabledExchanges();
getMaxActiveStocks();
