const express = require("express");

const {
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
} = require("../controllers/alertController");

const { requireAuth } = require("../middleware/authMiddleware");

const validate = require("../middleware/validate");

const {
  createAlertSchema,
  updateAlertSchema,
  alertIdSchema,
} = require("../validations/alertSchemas");

const router = express.Router();

router.use(requireAuth);

router.get("/", getAlerts);

router.post("/", validate(createAlertSchema), createAlert);

router.patch("/:id", validate(updateAlertSchema), updateAlert);

router.delete("/:id", validate(alertIdSchema), deleteAlert);

module.exports = router;
