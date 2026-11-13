// Railway's edge is one proxy. Vercel's rewrite of /api to Railway adds a
// second, and with one hop every user would share Vercel's IP address and
// one rate limit bucket.
const DEFAULT_TRUST_PROXY_HOPS = 1;

// Read on every call, so tests and the startup check see the current value.
const getTrustProxyHops = () => {
  const value = process.env.TRUST_PROXY_HOPS?.trim();

  if (!value) {
    return DEFAULT_TRUST_PROXY_HOPS;
  }

  const hops = Number(value);

  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error("TRUST_PROXY_HOPS must be a whole number of 0 or more");
  }

  return hops;
};

module.exports = {
  DEFAULT_TRUST_PROXY_HOPS,
  getTrustProxyHops,
};
