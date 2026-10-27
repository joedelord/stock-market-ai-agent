const {
  MARKET_HOURS,
  isMarketOpen,
  getOpenExchanges,
  createMarketScheduler,
} = require("../jobs/marketScheduler");
const { MARKET_CALENDAR } = require("../config/marketCalendar");

const [NEW_YORK, HELSINKI] = MARKET_HOURS;

const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("isMarketOpen and getOpenExchanges", () => {
  test.each([
    ["2026-10-14T13:29:00Z", false],
    ["2026-10-14T13:30:00Z", true],
    ["2026-10-14T20:14:00Z", true],
    ["2026-10-14T20:15:00Z", true],
    ["2026-10-14T20:16:00Z", false],
  ])("New York at %s is open: %s", (time, expected) => {
    expect(isMarketOpen(new Date(time), [NEW_YORK])).toBe(expected);
  });

  test.each([
    ["2026-10-14T06:59:00Z", false],
    ["2026-10-14T07:00:00Z", true],
    ["2026-10-14T15:44:00Z", true],
    ["2026-10-14T15:45:00Z", true],
    ["2026-10-14T15:46:00Z", false],
  ])("Helsinki at %s is open: %s", (time, expected) => {
    expect(isMarketOpen(new Date(time), [HELSINKI])).toBe(expected);
  });

  test("US holiday does not stop Helsinki", () => {
    expect(getOpenExchanges(new Date("2026-11-26T15:00:00Z"))).toEqual(["XHEL"]);
  });

  test("Helsinki holiday does not stop US markets", () => {
    expect(getOpenExchanges(new Date("2026-12-24T15:00:00Z"))).toEqual(["XNAS", "XNYS"]);
  });

  test("early close allows the final candle tick and stops afterwards", () => {
    expect(getOpenExchanges(new Date("2026-11-27T18:15:00Z"))).toEqual(["XNAS", "XNYS"]);
    expect(getOpenExchanges(new Date("2026-11-27T18:16:00Z"))).toEqual([]);
  });

  test("uses the local date, including when UTC is the next day", () => {
    const overnightTestMarket = {
      exchanges: ["XNYS"],
      timeZone: "America/New_York",
      open: "19:00",
      close: "23:00",
    };
    expect(getOpenExchanges(new Date("2026-11-27T01:00:00Z"), [overnightTestMarket])).toEqual([]);
  });

  test("missing calendar falls back to normal hours per exchange", () => {
    // XTST has no calendar, so Thanksgiving only closes XNYS.
    const mixedMarket = { ...NEW_YORK, exchanges: ["XNYS", "XTST"] };
    expect(getOpenExchanges(new Date("2026-11-26T15:00:00Z"), [mixedMarket])).toEqual(["XTST"]);
  });

  test("calendar covers the current and next year for every exchange", () => {
    const currentYear = new Date().getFullYear();
    const exchanges = MARKET_HOURS.flatMap((market) => market.exchanges);

    for (const exchange of exchanges) {
      for (const year of [currentYear, currentYear + 1]) {
        expect(MARKET_CALENDAR[exchange]?.[year], `${exchange} ${year}`).toBeDefined();
      }
    }
  });

  test("follows New York daylight saving time", () => {
    expect(isMarketOpen(new Date("2026-11-04T14:29:00Z"), [NEW_YORK])).toBe(false);
    expect(isMarketOpen(new Date("2026-11-04T14:30:00Z"), [NEW_YORK])).toBe(true);
  });

  test("is closed on weekends", () => {
    expect(isMarketOpen(new Date("2026-10-17T15:00:00Z"))).toBe(false);
    expect(getOpenExchanges(new Date("2026-10-17T15:00:00Z"))).toEqual([]);
  });

  test("returns only Helsinki during Helsinki-only hours", () => {
    expect(getOpenExchanges(new Date("2026-10-14T08:00:00Z"))).toEqual(["XHEL"]);
  });

  test("returns both US and Helsinki exchanges when both are open", () => {
    expect(getOpenExchanges(new Date("2026-10-14T14:00:00Z"))).toEqual([
      "XNAS", "XNYS", "XHEL",
    ]);
  });

  test("returns only US exchanges after Helsinki closes", () => {
    expect(getOpenExchanges(new Date("2026-10-14T16:00:00Z"))).toEqual([
      "XNAS", "XNYS",
    ]);
  });

  test("returns no exchanges when all markets are closed", () => {
    expect(getOpenExchanges(new Date("2026-10-14T21:00:00Z"))).toEqual([]);
    expect(isMarketOpen(new Date("2026-10-14T21:00:00Z"))).toBe(false);
  });
});

describe("Market Scheduler", () => {
  test("passes open exchanges and abort signal to updater", async () => {
    const updatePrices = vi.fn().mockResolvedValue([]);
    const scheduler = createMarketScheduler({
      updatePrices,
      getExchanges: () => ["XHEL"],
    });

    await scheduler.run();
    expect(updatePrices).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      exchanges: ["XHEL"],
    });
    await scheduler.stop();
  });

  test("skips the run when all markets are closed", () => {
    const updatePrices = vi.fn().mockResolvedValue([]);
    const scheduler = createMarketScheduler({
      updatePrices,
      getExchanges: () => [],
    });
    expect(scheduler.run()).toBeNull();
    expect(updatePrices).not.toHaveBeenCalled();
  });

  test("skips the run while the previous one is still running", async () => {
    const deferred = createDeferred();
    const updatePrices = vi.fn().mockReturnValue(deferred.promise);
    const scheduler = createMarketScheduler({
      updatePrices,
      getExchanges: () => ["XNAS", "XNYS"],
    });

    const firstRun = scheduler.run();
    expect(scheduler.run()).toBeNull();
    expect(updatePrices).toHaveBeenCalledTimes(1);

    deferred.resolve([]);
    await firstRun;
    await scheduler.run();
    expect(updatePrices).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  test("keeps running after a failed update", async () => {
    const updatePrices = vi.fn()
      .mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValueOnce([]);
    const scheduler = createMarketScheduler({
      updatePrices,
      getExchanges: () => ["XNAS"],
    });

    await expect(scheduler.run()).resolves.toBeUndefined();
    await scheduler.run();
    expect(updatePrices).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  test("start runs an update right away", async () => {
    const updatePrices = vi.fn().mockResolvedValue([]);
    const scheduler = createMarketScheduler({
      updatePrices,
      getExchanges: () => ["XNAS"],
    });

    await scheduler.start();
    expect(updatePrices).toHaveBeenCalledTimes(1);
    await scheduler.stop();
  });

  test("stop aborts the current run and waits for it", async () => {
    let finished = false;
    const updatePrices = vi.fn().mockImplementation(
      ({ signal }) => new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          finished = true;
          resolve([]);
        }, { once: true });
      }),
    );
    const scheduler = createMarketScheduler({
      updatePrices,
      getExchanges: () => ["XNAS"],
    });

    scheduler.run();
    await scheduler.stop();
    expect(finished).toBe(true);
  });

  test("does not run after stop", async () => {
    const updatePrices = vi.fn().mockResolvedValue([]);
    const scheduler = createMarketScheduler({
      updatePrices,
      getExchanges: () => ["XNAS"],
    });

    await scheduler.stop();
    expect(scheduler.run()).toBeNull();
    expect(updatePrices).not.toHaveBeenCalled();
  });
});
