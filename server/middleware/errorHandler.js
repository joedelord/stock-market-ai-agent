const errorTracking = require("../utils/errorTracking");

const SERVER_ERROR_STATUS = 500;

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.expose && error.status) {
    if (error.status >= SERVER_ERROR_STATUS) {
      req.log.error(
        {
          err: error,
          cause: error.cause?.message,
        },
        "Upstream error",
      );
    }

    if (error.retryAfter) {
      res.set("Retry-After", error.retryAfter);
    }

    return res.status(error.status).json({
      error: error.message,
    });
  }

  req.log.error(
    {
      err: error,
      cause: error.cause?.message,
    },
    "Unhandled error",
  );

  // Only unexpected errors: upstream 5xx errors (Groq, Twelve Data) are
  // already explained to the user and would use up the Sentry quota. The
  // path leaves out the query string, which can hold tokens.
  errorTracking.captureError(error, {
    requestId: req.id,
    method: req.method,
    path: req.path,
  });

  return res.status(SERVER_ERROR_STATUS).json({
    error: "Internal server error",
  });
};

module.exports = errorHandler;
