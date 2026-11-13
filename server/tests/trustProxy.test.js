const {
  DEFAULT_TRUST_PROXY_HOPS,
  getTrustProxyHops,
} = require("../config/trustProxy");

describe("getTrustProxyHops", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("defaults to one hop", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "");

    expect(getTrustProxyHops()).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(DEFAULT_TRUST_PROXY_HOPS).toBe(1);
  });

  test.each([
    ["0", 0],
    ["2", 2],
    [" 2 ", 2],
  ])("reads %j as %i", (value, expected) => {
    vi.stubEnv("TRUST_PROXY_HOPS", value);

    expect(getTrustProxyHops()).toBe(expected);
  });

  test.each(["-1", "1.5", "two", "true"])("rejects %j", (value) => {
    vi.stubEnv("TRUST_PROXY_HOPS", value);

    expect(() => getTrustProxyHops()).toThrow(
      "TRUST_PROXY_HOPS must be a whole number of 0 or more",
    );
  });
});
