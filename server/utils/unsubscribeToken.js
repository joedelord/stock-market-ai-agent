const crypto = require("crypto");

const { getUnsubscribeSecret } = require("../config/secrets");

// Mixed into the signature, so a signature made for another purpose with the
// same secret is never accepted here.
const PURPOSE = "alert-email-unsubscribe";
const TOKEN_PATTERN = /^(\d+)\.([0-9a-f]{64})$/;

const sign = (userId) =>
  crypto
    .createHmac("sha256", getUnsubscribeSecret())
    .update(`${PURPOSE}:${userId}`)
    .digest("hex");

// Not a JWT, so it can never pass as a login token. It does not expire,
// because links in old emails must keep working, and it can only turn alert
// emails off.
const createUnsubscribeToken = (userId) => `${userId}.${sign(userId)}`;

// Returns the user id, or null when the token is malformed or forged.
const readUnsubscribeToken = (token) => {
  const match = TOKEN_PATTERN.exec(token);

  if (!match) {
    return null;
  }

  const [, userId, signature] = match;
  const expected = Buffer.from(sign(userId), "hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), expected)) {
    return null;
  }

  return Number(userId);
};

module.exports = {
  UNSUBSCRIBE_TOKEN_PATTERN: TOKEN_PATTERN,
  createUnsubscribeToken,
  readUnsubscribeToken,
};
