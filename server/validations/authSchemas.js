const { z } = require("zod");

const emailField = z.email("Invalid email address").trim().toLowerCase();

const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

const registerSchema = z.object({
  body: z.object({
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(100, "Username must be at most 100 characters"),

    email: emailField,

    password: newPasswordField,
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: emailField,

    password: z.string().min(1, "Password is required"),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),

    newPassword: newPasswordField,
  }),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailField,
  }),
});

const tokenField = (message) => z.string().regex(/^[0-9a-f]{64}$/, message);

const resetPasswordSchema = z.object({
  body: z.object({
    token: tokenField("Invalid reset token"),

    password: newPasswordField,
  }),
});

const verifyEmailSchema = z.object({
  body: z.object({
    token: tokenField("Invalid verification link"),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
};
