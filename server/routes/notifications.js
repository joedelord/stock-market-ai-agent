const express = require("express");

const {
  getNotifications,
  updateNotification,
  updateNotifications,
} = require("../controllers/notificationController");

const { requireAuth } = require("../middleware/authMiddleware");

const validate = require("../middleware/validate");

const {
  listNotificationsSchema,
  updateNotificationSchema,
  updateNotificationsSchema,
} = require("../validations/notificationSchemas");

const router = express.Router();

router.use(requireAuth);

router.get("/", validate(listNotificationsSchema), getNotifications);

// Marks all of the user's notifications read.
router.patch("/", validate(updateNotificationsSchema), updateNotifications);

router.patch("/:id", validate(updateNotificationSchema), updateNotification);

module.exports = router;
