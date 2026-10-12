const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    // Test files share one database, so they must not run in parallel.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
