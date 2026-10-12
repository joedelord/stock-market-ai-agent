import { describe, expect, test } from "vitest";

import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  test("lists validation problems", () => {
    const error = {
      response: {
        data: {
          error: "Validation failed",
          details: [
            {
              field: "body.username",
              message: "Username must be at least 3 characters",
            },
            {
              field: "body.password",
              message: "Password must be at least 8 characters",
            },
          ],
        },
      },
    };

    expect(getErrorMessage(error, "Failed")).toBe(
      "Username must be at least 3 characters. Password must be at least 8 characters",
    );
  });

  test("uses the server error message", () => {
    const error = { response: { data: { error: "Email is already in use" } } };

    expect(getErrorMessage(error, "Failed")).toBe("Email is already in use");
  });

  test("falls back when the server sent no message", () => {
    expect(getErrorMessage(new Error("Network Error"), "Failed")).toBe(
      "Failed",
    );
  });
});
