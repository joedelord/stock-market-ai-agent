const express = require("express");

const {
  getStocks,
  getStockById,
  createStock,
  getStockPrices,
  searchProviderStocks,
} = require("../controllers/stockController");

const {
  createStockAnalysis,
} = require("../controllers/stockAnalysisController");

const {
  getMarketOverview,
} = require("../controllers/marketOverviewController");

const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const {
  stockAnalysisLimiter,
  stockSearchLimiter,
} = require("../middleware/rateLimiters");
const validate = require("../middleware/validate");

const {
  createStockSchema,
  marketOverviewSchema,
  stockIdSchema,
  stockPricesSchema,
  stockSearchSchema,
} = require("../validations/stockSchemas");

const router = express.Router();

// Register before /:id so "overview" and "search" are not parsed as stock IDs.
router.get("/overview", validate(marketOverviewSchema), getMarketOverview);

// Searches Twelve Data, not the database, so admins can find stocks to add.
router.get(
  "/search",
  requireAuth,
  requireRole("admin"),
  stockSearchLimiter,
  validate(stockSearchSchema),
  searchProviderStocks,
);

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

// The stock catalog is shared by every user, so only admins can add to it.
router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validate(createStockSchema),
  createStock,
);

module.exports = router;
