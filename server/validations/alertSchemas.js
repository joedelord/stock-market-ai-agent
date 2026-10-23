const { z } = require("zod");

const { createIdField } = require("./commonFields");
const { stockIdField } = require("./stockSchemas");

const ALERT_TYPES = [
  "price_above",
  "price_below",
  "daily_change_above",
  "daily_change_below",
];

const REPEAT_MODES = ["once", "daily"];

// Matches NUMERIC(18,6) in stock_alerts.threshold.
const MAX_THRESHOLD = 999999999999.9999;
const THRESHOLD_DECIMALS = 6;

const alertIdField = createIdField("Alert ID");

const alertTypeField = z.enum(ALERT_TYPES, {
  error: `Alert type must be one of: ${ALERT_TYPES.join(", ")}`,
});

const thresholdField = z
  .number({ error: "Threshold must be a number" })
  .min(-100, "Threshold must be at least -100")
  .max(MAX_THRESHOLD, "Threshold is too large")
  .refine(
    (value) => value === Number(value.toFixed(THRESHOLD_DECIMALS)),
    "Threshold supports at most six decimal places",
  );

const repeatModeField = z.enum(REPEAT_MODES, {
  error: `Repeat mode must be one of: ${REPEAT_MODES.join(", ")}`,
});

const isActiveField = z.boolean({ error: "isActive must be a boolean" });

// The database has the same rule as a CHECK constraint.
const hasValidThreshold = (rule) =>
  rule.alertType === "daily_change_below"
    ? rule.threshold < 0
    : rule.threshold > 0;

const thresholdRuleError = {
  message:
    "Use a negative percentage for daily_change_below and a positive threshold for other types",
  path: ["threshold"],
};

const createAlertSchema = z.object({
  body: z
    .object({
      stockId: stockIdField,
      alertType: alertTypeField,
      threshold: thresholdField,
      repeatMode: repeatModeField.default("once"),
    })
    .strict()
    .refine(hasValidThreshold, thresholdRuleError),
});

// Update a complete rule together, or pause/resume it alone. This avoids
// validating a threshold against an outdated type in a concurrent request.
const updateAlertSchema = z.object({
  params: z.object({
    id: alertIdField,
  }),

  body: z.union([
    z
      .object({
        alertType: alertTypeField,
        threshold: thresholdField,
        repeatMode: repeatModeField,
        isActive: isActiveField.optional(),
      })
      .strict()
      .refine(hasValidThreshold, thresholdRuleError),

    z
      .object({
        isActive: isActiveField,
      })
      .strict(),
  ]),
});

const alertIdSchema = z.object({
  params: z.object({
    id: alertIdField,
  }),
});

module.exports = {
  createAlertSchema,
  updateAlertSchema,
  alertIdSchema,
};
