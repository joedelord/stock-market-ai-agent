// Exchange-local dates. Review exchange notices for exceptional closures.
// Add next year's calendar each autumn; a test fails when the next year is missing.
// Sources: https://www.nasdaq.com/european-market-activity/trading-hours
// https://www.nasdaqtrader.com/trader.aspx?id=Calendar
// https://www.nyse.com/trade/hours-calendars

// Nasdaq and NYSE share the same holiday calendar.
const US_2026 = {
  closed: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"],
  earlyClose: { "2026-11-27": "13:00", "2026-12-24": "13:00" },
};

const US_2027 = {
  closed: ["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"],
  earlyClose: { "2027-11-26": "13:00" },
};

const MARKET_CALENDAR = {
  XNAS: { 2026: US_2026, 2027: US_2027 },
  XNYS: { 2026: US_2026, 2027: US_2027 },
  XHEL: {
    2026: {
      closed: ["2026-01-01", "2026-01-06", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-06-19", "2026-12-24", "2026-12-25", "2026-12-31"],
      earlyClose: {},
    },
    2027: {
      closed: ["2027-01-01", "2027-01-06", "2027-03-26", "2027-03-29", "2027-05-06", "2027-06-25", "2027-12-06", "2027-12-24", "2027-12-31"],
      earlyClose: {},
    },
  },
};

module.exports = { MARKET_CALENDAR };
