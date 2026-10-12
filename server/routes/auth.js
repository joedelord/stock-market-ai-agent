const express = require("express");

const {
  register,
  login,
  logout,
  getCurrentUser,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

const { requireAuth } = require("../middleware/authMiddleware");

const {
  loginLimiter,
  loginEmailLimiter,
  registerLimiter,
  passwordResetLimiter,
  passwordResetEmailLimiter,
  changePasswordLimiter,
} = require("../middleware/rateLimiters");

const validate = require("../middleware/validate");

const {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validations/authSchemas");

const router = express.Router();

router.post("/register", registerLimiter, validate(registerSchema), register);

router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  loginEmailLimiter,
  login,
);

router.post("/logout", logout);

router.get("/me", requireAuth, getCurrentUser);

router.patch(
  "/password",
  requireAuth,
  changePasswordLimiter,
  validate(changePasswordSchema),
  changePassword,
);

router.post(
  "/forgot-password",
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  passwordResetEmailLimiter,
  forgotPassword,
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  validate(resetPasswordSchema),
  resetPassword,
);

module.exports = router;
