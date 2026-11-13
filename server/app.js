const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const pool = require("./config/db");
const { getTrustProxyHops } = require("./config/trustProxy");
const requestLogger = require("./middleware/requestLogger");
const emailService = require("./services/emailService");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const stockRoutes = require("./routes/stocks");
const watchlistRoutes = require("./routes/watchlist");
const alertRoutes = require("./routes/alerts");
const notificationRoutes = require("./routes/notifications");

const errorHandler = require("./middleware/errorHandler");
const serveClient = require("./middleware/serveClient");

const CLIENT_DIST_DIRECTORY =
  process.env.CLIENT_DIST_DIRECTORY ||
  path.resolve(__dirname, "../client/dist");

const app = express();

// req.ip, and so every rate limit, uses the address the outermost trusted
// proxy saw. See config/trustProxy.js for the Railway and Vercel hop counts.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", getTrustProxyHops());
}

app.use(requestLogger);

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

// For load balancers and uptime checks. Reports only whether the database is
// reachable, never error details.
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.json({
      status: "ok",
    });
  } catch (error) {
    req.log.error({ err: error }, "Health check failed");

    return res.status(503).json({
      status: "unavailable",
    });
  }
});

// Separate from /api/health, so an email outage never fails a deploy's
// health check. Point an uptime monitor here to hear about a revoked Gmail
// token or broken SMTP settings.
app.get("/api/health/email", async (req, res) => {
  const status = await emailService.checkEmailHealth();

  return res.status(status === "failing" ? 503 : 200).json({
    status,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/me/stocks", watchlistRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/notifications", notificationRoutes);

if (process.env.SERVE_CLIENT === "true") {
  app.use(serveClient(CLIENT_DIST_DIRECTORY));
}

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.use(errorHandler);

module.exports = app;
