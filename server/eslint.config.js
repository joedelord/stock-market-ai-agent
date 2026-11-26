const js = require("@eslint/js");
const globals = require("globals");
const { defineConfig } = require("eslint/config");

// Enforces the conventions in CLAUDE.md that a linter can check, so they do
// not depend on code review alone.
const CONVENTION_RULES = [
  {
    selector: "ImportDeclaration",
    message: "Use require() instead of import (CommonJS only).",
  },
  {
    selector: "ExportNamedDeclaration, ExportDefaultDeclaration, ExportAllDeclaration",
    message: "Use module.exports = { ... } instead of export (CommonJS only).",
  },
  {
    selector: "FunctionDeclaration",
    message: "Use an arrow function: const name = (...) => { ... }.",
  },
  {
    selector: "TemplateElement[value.raw=/RETURNING\\s+\\*/i]",
    message: "List the returned columns instead of RETURNING *.",
  },
];

module.exports = defineConfig([
  {
    ignores: ["node_modules/"],
  },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "no-restricted-syntax": ["error", ...CONVENTION_RULES],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // vitest.config.js sets globals: true.
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
]);
