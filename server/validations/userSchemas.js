const { z } = require("zod");

const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce
      .number()
      .int()
      .min(1, "Page must be a positive integer")
      .default(1),

    pageSize: z.coerce
      .number()
      .int()
      .min(1, "Page size must be between 1 and 100")
      .max(100, "Page size must be between 1 and 100")
      .default(20),
  }),
});

const userIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive("User ID must be a positive integer"),
  }),
});

const updateUserRoleSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive("User ID must be a positive integer"),
  }),

  body: z.object({
    role: z.enum(["user", "moderator", "admin"], {
      error: "Invalid role",
    }),
  }),
});

const createUserSchema = z.object({
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(100),

    email: z.email("Invalid email address").trim().toLowerCase(),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128),

    role: z.enum(["user", "moderator", "admin"]).default("user"),
  }),
});

module.exports = {
  listUsersSchema,
  userIdSchema,
  updateUserRoleSchema,
  createUserSchema,
};
