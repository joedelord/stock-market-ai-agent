const notificationModel = require("../models/notificationModel");

const getNotifications = async (req, res, next) => {
  try {
    const { limit } = req.validatedQuery;

    const notifications = await notificationModel.getNotifications(
      req.user.id,
      limit,
    );

    const unreadCount = await notificationModel.getUnreadNotificationCount(
      req.user.id,
    );

    return res.json({ notifications, unreadCount });
  } catch (error) {
    return next(error);
  }
};

const updateNotification = async (req, res, next) => {
  try {
    const notification = await notificationModel.updateNotification(
      req.user.id,
      req.validatedParams.id,
      req.body.read,
    );

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found",
      });
    }

    return res.json({ notification });
  } catch (error) {
    return next(error);
  }
};

const updateNotifications = async (req, res, next) => {
  try {
    const updated = await notificationModel.markAllNotificationsRead(
      req.user.id,
    );

    return res.json({ updated });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getNotifications,
  updateNotification,
  updateNotifications,
};
