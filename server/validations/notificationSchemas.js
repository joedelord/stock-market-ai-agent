const { z } = require("zod");

const { createIdField } = require("./commonFields");

const notificationIdField = createIdField("Notification ID");

const readField = z.boolean({ error: "read must be a boolean" });

const listNotificationsSchema = z.object({
  query: z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be between 1 and 100")
      .max(100, "Limit must be between 1 and 100")
      .default(50),
  }),
});

const updateNotificationSchema = z.object({
  params: z.object({
    id: notificationIdField,
  }),

  body: z
    .object({
      read: readField,
    })
    .strict(),
});

// Only marking everything read is supported; unread is per notification.
const updateNotificationsSchema = z.object({
  body: z
    .object({
      read: z.literal(true, { error: "read must be true" }),
    })
    .strict(),
});

module.exports = {
  listNotificationsSchema,
  updateNotificationSchema,
  updateNotificationsSchema,
};
