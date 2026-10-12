const authModel = require("../models/authModel");
const { verifyToken } = require("../utils/token");

// Loads the user on every request so role changes, deletions and logouts take
// effect immediately instead of when the token expires.
const requireAuth = async (req, res, next) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  let payload;

  try {
    payload = verifyToken(token);
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }

  const user = await authModel.findUserAuthState(payload.sub);

  if (!user || user.token_version !== payload.ver) {
    return res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }

  req.user = {
    id: user.id,
    role: user.role,
  };

  return next();
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
      });
    }

    return next();
  };
};

module.exports = {
  requireAuth,
  requireRole,
};
