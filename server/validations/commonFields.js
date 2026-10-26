const { z } = require("zod");

// Coerces, so both route params ("1") and pg's BIGINT strings in bodies
// pass. The upper bound keeps values that lose precision as numbers, or
// overflow BIGINT, out of the database.
const createIdField = (label) => {
  const message = `${label} must be a positive integer`;

  return z.coerce
    .number({ error: message })
    .int(message)
    .positive(message)
    .max(Number.MAX_SAFE_INTEGER, `${label} is too large`);
};

module.exports = {
  createIdField,
};
