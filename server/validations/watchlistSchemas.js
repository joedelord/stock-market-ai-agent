const { z } = require("zod");

const { stockIdField } = require("./stockSchemas");

const createWatchlistStockSchema = z.object({
  body: z
    .object({
      stockId: stockIdField,
    })
    .strict(),
});

const watchlistStockIdSchema = z.object({
  params: z.object({
    id: stockIdField,
  }),
});

module.exports = {
  createWatchlistStockSchema,
  watchlistStockIdSchema,
};
