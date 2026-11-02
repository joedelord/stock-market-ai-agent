process.env.NODE_ENV = "test";
// Existing tests cover Helsinki too. US-only tests override this per test.
process.env.ENABLED_EXCHANGES = "XNAS,XNYS,XHEL";

require("../config/env");
