const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const pool = require("./config/db");
const requestLogger = require("./middleware/requestLogger");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");

const errorHandler = require("./middleware/errorHandler");

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
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

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.use(errorHandler);

module.exports = app;
