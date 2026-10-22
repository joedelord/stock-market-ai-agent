// Number("") and Number(null) are 0, which would hide a missing price, so
// those become NaN. pg also returns NUMERIC columns as strings.
const parseDecimal = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return NaN;
  }

  return Number(value);
};

module.exports = {
  parseDecimal,
};
