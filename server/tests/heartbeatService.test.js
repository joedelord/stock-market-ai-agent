const { pingHeartbeat } = require("../services/heartbeatService");

describe("pingHeartbeat", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("does nothing without HEARTBEAT_URL", async () => {
    vi.stubEnv("HEARTBEAT_URL", "");

    await pingHeartbeat();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("calls HEARTBEAT_URL", async () => {
    vi.stubEnv("HEARTBEAT_URL", "https://hc-ping.com/test-check");
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await pingHeartbeat();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hc-ping.com/test-check",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("never throws when the ping fails", async () => {
    vi.stubEnv("HEARTBEAT_URL", "https://hc-ping.com/test-check");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(pingHeartbeat()).resolves.toBeUndefined();
    await expect(pingHeartbeat()).resolves.toBeUndefined();
  });
});
