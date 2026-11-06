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

const GMAIL_VARIABLES = [
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
];

// Setting only some of the Gmail variables would quietly fall back to SMTP.
const usesGmailApi = GMAIL_VARIABLES.some((name) => process.env[name]);

// Without these, verification, password reset and alert emails would only
// fail later, one request at a time.
const PRODUCTION_VARIABLES = isProduction ? ["CLIENT_ORIGIN", "MAIL_FROM"] : [];

const EMAIL_VARIABLES = usesGmailApi
  ? GMAIL_VARIABLES
  : isProduction
    ? ["SMTP_HOST"]
    : [];

const REQUIRED_VARIABLES = [
  ...DATABASE_VARIABLES,
  "JWT_SECRET",
  ...PRODUCTION_VARIABLES,
  ...EMAIL_VARIABLES,
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
