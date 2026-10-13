const express = require("express");

const {
  getStocks,
  getStockById,
  createStock,
  getStockPrices,
} = require("../controllers/stockController");

const validate = require("../middleware/validate");

const {
  createStockSchema,
  stockIdSchema,
  stockPricesSchema,
} = require("../validations/stockSchemas");

const router = express.Router();

router.get("/", getStocks);

router.get("/:id", validate(stockIdSchema), getStockById);

router.get("/:id/prices", validate(stockPricesSchema), getStockPrices);

// POST has no authentication during development.
// Protect it before release.
router.post("/", validate(createStockSchema), createStock);

module.exports = router;
