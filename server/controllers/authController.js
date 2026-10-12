const authModel = require("../models/authModel");
const userModel = require("../models/userModel");
const {
  createUserAccount,
  authenticate,
  toPublicUser,
  changeUserPassword,
  requestPasswordReset,
  resetPassword: resetUserPassword,
} = require("../services/userService");
const { createToken, verifyToken } = require("../utils/token");

const COOKIE_NAME = "auth_token";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: Number(process.env.COOKIE_EXPIRES_IN_MS) || 3600000,
});

const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const user = await createUserAccount({ username, email, password });

    const token = createToken(user);

    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.status(201).json({
      user: toPublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await authenticate(email, password);

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const token = createToken(user);

    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.json({
      user: toPublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

// Bumping the token version invalidates every token issued to the user, so a
// copied cookie stops working after logout.
const logout = async (req, res, next) => {
  try {
    const token = req.cookies[COOKIE_NAME];

    if (token) {
      let payload = null;

      try {
        payload = verifyToken(token);
      } catch (error) {
        // An invalid or expired token has nothing left to revoke.
      }

      if (payload) {
        await authModel.incrementTokenVersion(payload.sub);
      }
    }

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return res.json({
      message: "Logged out",
    });
  } catch (error) {
    return next(error);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    const user = await userModel.getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    return res.json({
      user,
    });
  } catch (error) {
    return next(error);
  }
};

// Changing the password logs out every other device; this one gets a fresh
// cookie so the user stays signed in here.
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await changeUserPassword(
      req.user.id,
      currentPassword,
      newPassword,
    );

    res.cookie(COOKIE_NAME, createToken(user), getCookieOptions());

    return res.json({
      message: "Password changed",
    });
  } catch (error) {
    return next(error);
  }
};

// Always gives the same answer so the endpoint cannot be used to find out
// which emails have accounts.
const forgotPassword = async (req, res, next) => {
  try {
    await requestPasswordReset(req.body.email);

    return res.json({
      message: "If an account exists for that email, a reset link has been sent",
    });
  } catch (error) {
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    await resetUserPassword(token, password);

    return res.json({
      message: "Password has been reset",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  changePassword,
  forgotPassword,
  resetPassword,
};
