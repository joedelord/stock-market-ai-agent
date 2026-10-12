const pool = require("../../config/db");

const clearDatabase = async () => {
  await pool.query("TRUNCATE TABLE users, rate_limits RESTART IDENTITY CASCADE");
};

module.exports = {
  clearDatabase,
};
