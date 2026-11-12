// 32 characters is 256 bits of hex, the strength of the HMAC-SHA256
// signatures these secrets are used for.
const MIN_SECRET_LENGTH = 32;

// Values from .env.example and the README. They pass a presence check, but
// anyone who has read the repository could forge tokens with them.
const PLACEHOLDER_SECRETS = [
  "replace_with_a_long_random_secret",
  "your_long_random_secret",
];

const SIGNED_SECRET_VARIABLES = ["JWT_SECRET", "UNSUBSCRIBE_SECRET"];

const checkSecret = (name) => {
  const value = process.env[name];

  if (PLACEHOLDER_SECRETS.includes(value)) {
    throw new Error(`${name} is still the example value. Generate a new one.`);
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_SECRET_LENGTH} characters long`,
    );
  }
};

// Only production is checked, so short secrets in local .env files keep
// working. Read on every call, so tests can switch NODE_ENV.
const validateSecrets = () => {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  SIGNED_SECRET_VARIABLES.forEach(checkSecret);

  // With the same value, rotating a leaked JWT_SECRET would again break the
  // unsubscribe links in every email already sent.
  if (process.env.UNSUBSCRIBE_SECRET === process.env.JWT_SECRET) {
    throw new Error("UNSUBSCRIBE_SECRET must differ from JWT_SECRET");
  }
};

// Production requires its own secret (see config/env.js). Elsewhere it falls
// back to JWT_SECRET, so development and tests need no extra setup.
const getUnsubscribeSecret = () =>
  process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;

module.exports = {
  MIN_SECRET_LENGTH,
  validateSecrets,
  getUnsubscribeSecret,
};
