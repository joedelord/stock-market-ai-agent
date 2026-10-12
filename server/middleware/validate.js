const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }

    if (result.data.body) {
      req.body = result.data.body;
    }

    if (result.data.params) {
      req.validatedParams = result.data.params;
    }

    if (result.data.query) {
      req.validatedQuery = result.data.query;
    }

    return next();
  };
};

module.exports = validate;
