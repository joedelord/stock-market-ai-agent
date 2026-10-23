const pool = require("../../config/db");

const clearDatabase = async () => {
  await pool.query(
    "TRUNCATE TABLE user_stocks, stock_prices, stocks, users, rate_limits RESTART IDENTITY CASCADE",
  );
};

module.exports = {
  clearDatabase,
};
