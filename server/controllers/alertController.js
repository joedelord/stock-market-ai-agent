const alertModel = require("../models/alertModel");

const getAlerts = async (req, res, next) => {
  try {
    const alerts = await alertModel.getAlerts(req.user.id);

    return res.json({ alerts });
  } catch (error) {
    return next(error);
  }
};

const createAlert = async (req, res, next) => {
  try {
    const { stockId, alertType, threshold, repeatMode } = req.body;

    const alert = await alertModel.createAlert(req.user.id, {
      stockId,
      alertType,
      threshold,
      repeatMode,
    });

    if (!alert) {
      return res.status(404).json({
        error: "Active stock not found",
      });
    }

    return res.status(201).json({ alert });
  } catch (error) {
    return next(error);
  }
};

const updateAlert = async (req, res, next) => {
  try {
    const alert = await alertModel.updateAlert(
      req.user.id,
      req.validatedParams.id,
      req.body,
    );

    if (!alert) {
      return res.status(404).json({
        error: "Alert not found",
      });
    }

    return res.json({ alert });
  } catch (error) {
    return next(error);
  }
};

const deleteAlert = async (req, res, next) => {
  try {
    const alert = await alertModel.deleteAlert(
      req.user.id,
      req.validatedParams.id,
    );

    if (!alert) {
      return res.status(404).json({
        error: "Alert not found",
      });
    }

    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
};
