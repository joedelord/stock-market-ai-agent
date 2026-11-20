const crypto = require("crypto");

const { getUnsubscribeSecret } = require("../config/secrets");

// Each list has its own purpose mixed into the signature, so a link from an
// alert email can never turn off the daily summary or the other way round.
// The alerts purpose predates the digest and must not change, or links in
// old alert emails would stop working.
const PURPOSES = {
  alerts: "alert-email-unsubscribe",
  digest: "digest-email-unsubscribe",
};
const UNSUBSCRIBE_LISTS = Object.keys(PURPOSES);
const TOKEN_PATTERN = /^(\d+)\.([0-9a-f]{64})$/;

const sign = (userId, list) =>
  crypto
    .createHmac("sha256", getUnsubscribeSecret())
    .update(`${PURPOSES[list]}:${userId}`)
    .digest("hex");

// Not a JWT, so it can never pass as a login token. It does not expire,
// because links in old emails must keep working, and it can only turn one
// kind of email off.
const createUnsubscribeToken = (userId, list = "alerts") =>
  `${userId}.${sign(userId, list)}`;

// Returns the user id, or null when the token is malformed, forged or made
// for another list.
const readUnsubscribeToken = (token, list = "alerts") => {
  const match = TOKEN_PATTERN.exec(token);

  if (!match || !PURPOSES[list]) {
    return null;
  }

  const [, userId, signature] = match;
  const expected = Buffer.from(sign(userId, list), "hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), expected)) {
    return null;
  }

  return Number(userId);
};

module.exports = {
  UNSUBSCRIBE_LISTS,
  UNSUBSCRIBE_TOKEN_PATTERN: TOKEN_PATTERN,
  createUnsubscribeToken,
  readUnsubscribeToken,
};
