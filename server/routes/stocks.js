const express = require("express");

const {
  getStocks,
  getStockById,
  createStock,
  getStockPrices,
} = require("../controllers/stockController");

const {
  createStockAnalysis,
} = require("../controllers/stockAnalysisController");

const { requireAuth } = require("../middleware/authMiddleware");
const { stockAnalysisLimiter } = require("../middleware/rateLimiters");
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

router.post(
  "/:id/analysis",
  requireAuth,
  stockAnalysisLimiter,
  validate(stockIdSchema),
  createStockAnalysis,
);

// POST has no authentication during development.
// Protect it before release.
router.post("/", validate(createStockSchema), createStock);

module.exports = router;
