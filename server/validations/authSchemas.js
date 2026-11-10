const { z } = require("zod");

const { UNSUBSCRIBE_TOKEN_PATTERN } = require("../utils/unsubscribeToken");

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

const deleteAccountSchema = z.object({
  body: z.object({
    password: z.string().min(1, "Password is required"),
  }),
});

const emailPreferencesSchema = z.object({
  body: z.object({
    emailAlertsEnabled: z.boolean("emailAlertsEnabled must be true or false"),
  }),
});

// The token is in the query string, because email providers' one-click
// unsubscribe POSTs to the URL in the List-Unsubscribe header as it is.
const unsubscribeSchema = z.object({
  query: z.object({
    token: z
      .string("Invalid unsubscribe link")
      .regex(UNSUBSCRIBE_TOKEN_PATTERN, "Invalid unsubscribe link"),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  deleteAccountSchema,
  emailPreferencesSchema,
  unsubscribeSchema,
};
