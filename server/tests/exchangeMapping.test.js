const {
  getEnabledExchanges,
  isExchangeEnabled,
} = require("../config/exchangeMapping");

describe("ENABLED_EXCHANGES", () => {
  let original;

  beforeEach(() => {
    original = process.env.ENABLED_EXCHANGES;
  });

  afterEach(() => {
    process.env.ENABLED_EXCHANGES = original;
  });

  test("defaults to the US exchanges", () => {
    delete process.env.ENABLED_EXCHANGES;

    expect(getEnabledExchanges()).toEqual(["XNAS", "XNYS"]);
    expect(isExchangeEnabled("XNAS")).toBe(true);
    expect(isExchangeEnabled("XHEL")).toBe(false);
  });

  test("treats an empty value as the default", () => {
    process.env.ENABLED_EXCHANGES = " ";

    expect(getEnabledExchanges()).toEqual(["XNAS", "XNYS"]);
  });

  test("trims, upper-cases and removes duplicate codes", () => {
    process.env.ENABLED_EXCHANGES = " xnas , XHEL,xnas,";

    expect(getEnabledExchanges()).toEqual(["XNAS", "XHEL"]);
    expect(isExchangeEnabled("XHEL")).toBe(true);
    expect(isExchangeEnabled("XNYS")).toBe(false);
  });

  test("rejects unknown exchange codes", () => {
    process.env.ENABLED_EXCHANGES = "XNAS,XLON,MOCK";

    expect(() => getEnabledExchanges()).toThrow(
      "Unknown exchange in ENABLED_EXCHANGES: XLON, MOCK. Supported exchanges: XHEL, XNAS, XNYS",
    );
  });

  test("rejects a list without exchanges", () => {
    process.env.ENABLED_EXCHANGES = ",";

    expect(() => getEnabledExchanges()).toThrow(
      "ENABLED_EXCHANGES must list at least one exchange",
    );
  });

  test("fails at startup when the configuration is invalid", () => {
    process.env.ENABLED_EXCHANGES = "XLON";
    const envPath = require.resolve("../config/env");
    delete require.cache[envPath];

    try {
      expect(() => require("../config/env")).toThrow(
        "Unknown exchange in ENABLED_EXCHANGES: XLON",
      );
    } finally {
      delete require.cache[envPath];
    }
  });
});
