const errorHandler = require("../middleware/errorHandler");
const HttpError = require("../utils/httpError");
const errorTracking = require("../utils/errorTracking");

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
  let captureError;

  beforeEach(() => {
    captureError = vi.spyOn(errorTracking, "captureError");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      { err: error, cause: "Groq responded with HTTP 401" },
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
      { err: error, cause: undefined },
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

  test("reports unexpected errors with the path but not the query string", () => {
    const req = {
      ...mockRequest(),
      id: "request-1",
      method: "POST",
      path: "/api/auth/unsubscribe",
      url: "/api/auth/unsubscribe?token=secret",
    };
    const error = new Error("Unexpected");

    errorHandler(error, req, mockResponse(), vi.fn());

    expect(captureError).toHaveBeenCalledWith(error, {
      requestId: "request-1",
      method: "POST",
      path: "/api/auth/unsubscribe",
    });
  });

  test("does not report exposed errors", () => {
    errorHandler(new HttpError(502, "Upstream"), mockRequest(), mockResponse(), vi.fn());
    errorHandler(new HttpError(404, "Not found"), mockRequest(), mockResponse(), vi.fn());

    expect(captureError).not.toHaveBeenCalled();
  });
});
