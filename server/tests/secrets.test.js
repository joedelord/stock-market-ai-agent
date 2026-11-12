const { validateSecrets } = require("../config/secrets");
const {
  createUnsubscribeToken,
  readUnsubscribeToken,
} = require("../utils/unsubscribeToken");

const STRONG_JWT_SECRET = "a".repeat(64);
const STRONG_UNSUBSCRIBE_SECRET = "b".repeat(64);

const VARIABLES = ["NODE_ENV", "JWT_SECRET", "UNSUBSCRIBE_SECRET"];

let original;

beforeEach(() => {
  original = Object.fromEntries(
    VARIABLES.map((name) => [name, process.env[name]]),
  );
});

afterEach(() => {
  VARIABLES.forEach((name) => {
    if (original[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original[name];
    }
  });
});

describe("validateSecrets in production", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = STRONG_JWT_SECRET;
    process.env.UNSUBSCRIBE_SECRET = STRONG_UNSUBSCRIBE_SECRET;
  });

  test("accepts long, distinct secrets", () => {
    expect(() => validateSecrets()).not.toThrow();
  });

  test("rejects the example JWT secret", () => {
    process.env.JWT_SECRET = "replace_with_a_long_random_secret";

    expect(() => validateSecrets()).toThrow(
      "JWT_SECRET is still the example value. Generate a new one.",
    );
  });

  test("rejects a short JWT secret", () => {
    process.env.JWT_SECRET = "short";

    expect(() => validateSecrets()).toThrow(
      "JWT_SECRET must be at least 32 characters long",
    );
  });

  test("rejects a short unsubscribe secret", () => {
    process.env.UNSUBSCRIBE_SECRET = "short";

    expect(() => validateSecrets()).toThrow(
      "UNSUBSCRIBE_SECRET must be at least 32 characters long",
    );
  });

  test("rejects an unsubscribe secret equal to the JWT secret", () => {
    process.env.UNSUBSCRIBE_SECRET = STRONG_JWT_SECRET;

    expect(() => validateSecrets()).toThrow(
      "UNSUBSCRIBE_SECRET must differ from JWT_SECRET",
    );
  });
});

describe("validateSecrets outside production", () => {
  test("allows short secrets for local development", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "short";
    delete process.env.UNSUBSCRIBE_SECRET;

    expect(() => validateSecrets()).not.toThrow();
  });
});

describe("Unsubscribe tokens", () => {
  test("are signed with UNSUBSCRIBE_SECRET, not JWT_SECRET", () => {
    process.env.UNSUBSCRIBE_SECRET = STRONG_UNSUBSCRIBE_SECRET;
    const token = createUnsubscribeToken(42);

    process.env.JWT_SECRET = STRONG_JWT_SECRET;
    expect(readUnsubscribeToken(token)).toBe(42);

    process.env.UNSUBSCRIBE_SECRET = "c".repeat(64);
    expect(readUnsubscribeToken(token)).toBeNull();
  });

  test("fall back to JWT_SECRET when UNSUBSCRIBE_SECRET is not set", () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    const token = createUnsubscribeToken(42);

    expect(readUnsubscribeToken(token)).toBe(42);

    process.env.JWT_SECRET = STRONG_JWT_SECRET;
    expect(readUnsubscribeToken(token)).toBeNull();
  });
});
