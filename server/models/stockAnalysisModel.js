const pool = require("../config/db");

const getStockAnalysis = async (stockId, cacheKey, maxAgeMs) => {
  const result = await pool.query(
    `SELECT
      stock_id,
      cache_key,
      analysis,
      created_at
    FROM stock_analyses
    WHERE stock_id = $1
      AND cache_key = $2
      AND created_at > NOW() - make_interval(secs => $3::double precision / 1000)`,
    [stockId, cacheKey, maxAgeMs],
  );

  return result.rows[0];
};

const getLatestStockAnalysis = async (stockId, maxAgeMs) => {
  const result = await pool.query(
    `SELECT
      stock_id,
      cache_key,
      analysis,
      metrics,
      news,
      created_at
    FROM stock_analyses
    WHERE stock_id = $1
      AND metrics IS NOT NULL
      AND news IS NOT NULL
      AND created_at > NOW() - make_interval(secs => $2::double precision / 1000)
    ORDER BY created_at DESC
    LIMIT 1`,
    [stockId, maxAgeMs],
  );

  return result.rows[0];
};

const saveStockAnalysis = async (stockId, cacheKey, analysis, metrics, news) => {
  const result = await pool.query(
    `INSERT INTO stock_analyses (
      stock_id,
      cache_key,
      analysis,
      metrics,
      news,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (stock_id, cache_key)
    DO UPDATE SET
      analysis = EXCLUDED.analysis,
      metrics = EXCLUDED.metrics,
      news = EXCLUDED.news,
      created_at = EXCLUDED.created_at
    RETURNING
      stock_id,
      cache_key,
      analysis,
      metrics,
      news,
      created_at`,
    [stockId, cacheKey, analysis, metrics, news],
  );

  return result.rows[0];
};

const deleteExpiredStockAnalyses = async (maxAgeMs) => {
  const result = await pool.query(
    `DELETE FROM stock_analyses
    WHERE created_at <= NOW() - make_interval(secs => $1::double precision / 1000)`,
    [maxAgeMs],
  );

  return result.rowCount;
};

module.exports = {
  getStockAnalysis,
  getLatestStockAnalysis,
  saveStockAnalysis,
  deleteExpiredStockAnalyses,
};
