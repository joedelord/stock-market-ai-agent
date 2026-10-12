const jwt = require("jsonwebtoken");

const createToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      ver: user.token_version,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    },
  );
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
  });
};

module.exports = {
  createToken,
  verifyToken,
};
