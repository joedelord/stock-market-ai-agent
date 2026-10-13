const pool = require("../../config/db");

const clearDatabase = async () => {
  await pool.query(
    "TRUNCATE TABLE stock_prices, stocks, users, rate_limits RESTART IDENTITY CASCADE",
  );
};

module.exports = {
  clearDatabase,
};
