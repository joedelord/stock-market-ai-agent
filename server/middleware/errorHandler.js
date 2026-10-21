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

  return res.status(SERVER_ERROR_STATUS).json({
    error: "Internal server error",
  });
};

module.exports = errorHandler;
