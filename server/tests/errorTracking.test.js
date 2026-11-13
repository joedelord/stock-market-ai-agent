const Sentry = require("@sentry/node");

const errorTracking = require("../utils/errorTracking");

describe("errorTracking without SENTRY_DSN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("does not initialize Sentry or send events", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const init = vi.spyOn(Sentry, "init");
    const captureException = vi.spyOn(Sentry, "captureException");
    const close = vi.spyOn(Sentry, "close");

    errorTracking.initErrorTracking();
    errorTracking.captureError(new Error("Test error"));
    await errorTracking.flushErrors();

    expect(init).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
