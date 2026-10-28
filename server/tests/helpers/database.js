const pool = require("../../config/db");

const clearDatabase = async () => {
  await pool.query(
    "TRUNCATE TABLE stock_analyses, notifications, stock_alerts, user_stocks, stock_prices, stocks, users, rate_limits RESTART IDENTITY CASCADE",
  );
};

module.exports = {
  clearDatabase,
};
