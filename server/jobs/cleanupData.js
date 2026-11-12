const notificationModel = require("../models/notificationModel");
const passwordResetModel = require("../models/passwordResetModel");
const emailVerificationModel = require("../models/emailVerificationModel");
const stockModel = require("../models/stockModel");

const DAY_MS = 24 * 60 * 60 * 1000;

// The bell shows the newest notifications, and alert emails stop retrying
// after a day, so older rows are only kept as a short history.
const NOTIFICATION_MAX_AGE_MS = 90 * DAY_MS;

// The AI analysis reads up to 2500 bars of 15-minute prices (about 96 US
// trading days) for volatility, so a year leaves plenty of margin.
const STOCK_PRICE_MAX_AGE_MS = 365 * DAY_MS;

// Expired tokens can never be used, and verification tokens are only
// replaced when a user asks for a new email, so they would otherwise stay.
const cleanupOldData = async () => {
  const notifications = await notificationModel.deleteOldNotifications(
    NOTIFICATION_MAX_AGE_MS,
  );
  const passwordResetTokens =
    await passwordResetModel.deleteExpiredResetTokens();
  const verificationTokens =
    await emailVerificationModel.deleteExpiredVerificationTokens();
  const stockPrices = await stockModel.deleteOldStockPrices(
    STOCK_PRICE_MAX_AGE_MS,
  );

  return {
    notifications,
    passwordResetTokens,
    verificationTokens,
    stockPrices,
  };
};

module.exports = {
  NOTIFICATION_MAX_AGE_MS,
  STOCK_PRICE_MAX_AGE_MS,
  cleanupOldData,
};
