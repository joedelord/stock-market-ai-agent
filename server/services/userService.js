const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const authModel = require("../models/authModel");
const passwordResetModel = require("../models/passwordResetModel");
const emailService = require("./emailService");
const HttpError = require("../utils/httpError");
const logger = require("../utils/logger");

const SALT_ROUNDS = 12;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

// Compared against when no user matches the email, so a failed login takes
// the same time whether or not the account exists.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password", SALT_ROUNDS);

const toPublicUser = ({ password_hash, token_version, ...user }) => user;

const createUserAccount = async ({ username, email, password, role }) => {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    return await authModel.createUser({
      username,
      email,
      passwordHash,
      role,
    });
  } catch (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const field = error.constraint?.includes("email") ? "Email" : "Username";

      throw new HttpError(409, `${field} is already in use`);
    }

    throw error;
  }
};

const authenticate = async (email, password) => {
  const user = await authModel.findUserByEmail(email);

  const passwordMatches = await bcrypt.compare(
    password,
    user ? user.password_hash : DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    return null;
  }

  return user;
};

const changeUserPassword = async (userId, currentPassword, newPassword) => {
  const passwordHash = await authModel.findPasswordHashById(userId);

  if (!passwordHash) {
    throw new HttpError(404, "User not found");
  }

  const passwordMatches = await bcrypt.compare(currentPassword, passwordHash);

  if (!passwordMatches) {
    throw new HttpError(400, "Current password is incorrect");
  }

  const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const user = await authModel.updatePassword(userId, newPasswordHash);

  // Not awaited: a failing email must not undo or delay the change.
  emailService.sendPasswordChangedEmail(user.email).catch((error) => {
    logger.error({ err: error }, "Failed to send password changed email");
  });

  return user;
};

// Only the SHA-256 hash of a reset token is stored, so a database leak does
// not expose usable reset links.
const hashResetToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const requestPasswordReset = async (email) => {
  const user = await authModel.findUserByEmail(email);

  if (!user) {
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");

  await passwordResetModel.createResetToken(
    user.id,
    hashResetToken(token),
    new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  );

  const resetUrl = `${process.env.CLIENT_ORIGIN}/reset-password?token=${token}`;

  // Not awaited, so slow or failing delivery neither delays the response nor
  // reveals whether the account exists.
  emailService.sendPasswordResetEmail(user.email, resetUrl).catch((error) => {
    logger.error({ err: error }, "Failed to send password reset email");
  });
};

const resetPassword = async (token, newPassword) => {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const userId = await passwordResetModel.resetPasswordWithToken(
    hashResetToken(token),
    passwordHash,
  );

  if (!userId) {
    throw new HttpError(400, "Invalid or expired reset token");
  }
};

module.exports = {
  createUserAccount,
  authenticate,
  toPublicUser,
  changeUserPassword,
  requestPasswordReset,
  resetPassword,
};
