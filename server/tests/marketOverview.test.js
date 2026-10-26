const { buildOverview } = require("../services/marketOverview");

const stock = (id, change, overrides = {}) => ({
  id, symbol: `S${id}`, name: `Stock ${id}`, exchange: "XNAS", currency: "USD",
  close: "100", day_change_percent: change, follower_count: 1,
  price_time: "2026-10-26T14:00:00Z", ...overrides,
});

test("sorts positive and negative daily changes separately and limits to five", () => {
  const result = buildOverview(Array.from({ length: 20 }, (_, i) => stock(i + 1, i - 10)));
  expect(result.gainers.map((s) => s.day_change_percent)).toEqual([9, 8, 7, 6, 5]);
  expect(result.losers.map((s) => s.day_change_percent)).toEqual([-10, -9, -8, -7, -6]);
});

test("excludes older quotes within each exchange but preserves timestamps on weekends", () => {
  const result = buildOverview([
    stock(1, 50, { price_time: "2026-10-22T14:00:00Z" }),
    stock(2, 3, { price_time: "2026-10-23T14:00:00Z" }),
    stock(3, 4, { exchange: "XHEL", price_time: "2026-10-22T14:00:00Z" }),
  ]);
  expect(result.gainers.map((s) => s.id)).toEqual([3, 2]);
  expect(result.gainers[1].price_time).toBe("2026-10-23T14:00:00Z");
});

test("filters markets and ranks follows without requiring a quote", () => {
  const rows = [stock(1, 2, { follower_count: 2 }), stock(2, null, { exchange: "XHEL", close: null, price_time: null, follower_count: 8 }), stock(3, 0, { follower_count: 0 })];
  expect(buildOverview(rows).mostFollowed.map((s) => s.id)).toEqual([2, 1]);
  expect(buildOverview(rows, "us").mostFollowed.map((s) => s.id)).toEqual([1]);
  expect(buildOverview(rows, "helsinki").gainers).toEqual([]);
});

test("hides stocks with a single follower and unsupported exchanges", () => {
  const rows = [stock(1, 2, { follower_count: 1 }), stock(2, 5, { exchange: "MOCK", follower_count: 4 })];
  const result = buildOverview(rows);
  expect(result.mostFollowed).toEqual([]);
  expect(result.gainers.map((s) => s.id)).toEqual([1]);
});

test("ignores absent, invalid and unchanged quotes in movers", () => {
  expect(buildOverview([stock(1, null), stock(2, "NaN"), stock(3, 0), stock(4, 10, { price_time: null })]).gainers).toEqual([]);
  expect(buildOverview([]).mostFollowed).toEqual([]);
});
