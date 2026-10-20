const errorHandler = require("../middleware/errorHandler");
const HttpError = require("../utils/httpError");

const mockRequest = () => ({
  log: {
    error: vi.fn(),
  },
});

const mockResponse = () => {
  const res = {
    headersSent: false,
  };

  res.set = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);

  return res;
};

describe("Error Handler", () => {
  test("returns exposed client errors without logging them", () => {
    const req = mockRequest();
    const res = mockResponse();

    errorHandler(new HttpError(404, "User not found"), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
    expect(req.log.error).not.toHaveBeenCalled();
  });

  test("logs exposed server errors and keeps their message", () => {
    const req = mockRequest();
    const res = mockResponse();
    const error = new HttpError(502, "AI analysis service returned an error.", {
      cause: new Error("Groq responded with HTTP 401"),
    });

    errorHandler(error, req, res, vi.fn());

    expect(req.log.error).toHaveBeenCalledWith(
      { err: error },
      "Upstream error",
    );
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: "AI analysis service returned an error.",
    });
  });

  test("sets Retry-After when the error has one", () => {
    const res = mockResponse();
    const error = new HttpError(503, "Busy");
    error.retryAfter = "12";

    errorHandler(error, mockRequest(), res, vi.fn());

    expect(res.set).toHaveBeenCalledWith("Retry-After", "12");
  });

  test("hides unexpected errors behind a generic message", () => {
    const req = mockRequest();
    const res = mockResponse();
    const error = new Error("Database password is wrong");

    errorHandler(error, req, res, vi.fn());

    expect(req.log.error).toHaveBeenCalledWith(
      { err: error },
      "Unhandled error",
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  test("delegates to Express when headers were already sent", () => {
    const res = mockResponse();
    res.headersSent = true;
    const next = vi.fn();
    const error = new Error("Stream failed");

    errorHandler(error, mockRequest(), res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
