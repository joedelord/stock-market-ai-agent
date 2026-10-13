require("../config/env");

const pool = require("../config/db");
const { updateStockPrices } = require("../jobs/updateStockPrices");

const updatePrices = async () => {
  try {
    const results = await updateStockPrices();

    if (results.length === 0) {
      console.log("No active stocks to update");
      return;
    }

    console.table(results);

    if (results.some((result) => result.status === "error")) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Update failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

updatePrices();
