const express = require("express");

const {
  getWatchlistStocks,
  createWatchlistStock,
  deleteWatchlistStock,
} = require("../controllers/watchlistController");

const { requireAuth } = require("../middleware/authMiddleware");

const validate = require("../middleware/validate");

const {
  createWatchlistStockSchema,
  watchlistStockIdSchema,
} = require("../validations/watchlistSchemas");

const router = express.Router();

router.use(requireAuth);

router.get("/", getWatchlistStocks);

router.post("/", validate(createWatchlistStockSchema), createWatchlistStock);

router.delete("/:id", validate(watchlistStockIdSchema), deleteWatchlistStock);

module.exports = router;
