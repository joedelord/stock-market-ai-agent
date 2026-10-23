const { z } = require("zod");

const stockIdField = z.coerce
  .number({ error: "Stock ID must be a positive integer" })
  .int("Stock ID must be a positive integer")
  .positive("Stock ID must be a positive integer");

const createStockSchema = z.object({
  body: z
    .object({
      symbol: z
        .string()
        .trim()
        .min(1, "Symbol is required")
        .max(30, "Symbol must be at most 30 characters")
        .regex(/^[A-Za-z0-9._-]+$/, "Invalid symbol")
        .toUpperCase(),

      exchange: z
        .string()
        .trim()
        .length(4, "Exchange must be a 4-character MIC code")
        .regex(/^[A-Za-z0-9]+$/, "Invalid exchange")
        .toUpperCase(),

      name: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(200, "Name must be at most 200 characters"),

      currency: z
        .string()
        .trim()
        .length(3, "Currency must be a 3-letter code")
        .regex(/^[A-Za-z]+$/, "Invalid currency")
        .toUpperCase(),
    })
    .strict(),
});

const stockIdSchema = z.object({
  params: z.object({
    id: stockIdField,
  }),
});

const stockPricesSchema = z.object({
  params: z.object({
    id: stockIdField,
  }),

  query: z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be between 1 and 1000")
      .max(1000, "Limit must be between 1 and 1000")
      .default(100),
  }),
});

module.exports = {
  stockIdField,
  createStockSchema,
  stockIdSchema,
  stockPricesSchema,
};
