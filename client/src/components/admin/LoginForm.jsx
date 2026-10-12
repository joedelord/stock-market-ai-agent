import { useState } from "react";

import PasswordInput from "../PasswordInput";

function LoginForm({ onSubmit, errorMessage, isSubmitting }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();

    onSubmit(email, password);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md bg-gray-50 mx-auto p-5 rounded border-2"
    >
      <div className="flex flex-col gap-1">
        <label className="" htmlFor="email">
          Email
        </label>

        <input
          className="border rounded p-1"
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          required
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1 mt-3">
        <label htmlFor="password">Password</label>

        <PasswordInput
          className="border rounded p-1"
          id="password"
          value={password}
          autoComplete="current-password"
          required
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {errorMessage && (
        <p className="mt-2 text-red-500" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 mt-4"
      >
        {isSubmitting ? "Logging in..." : "Login"}
      </button>
    </form>
  );
}

export default LoginForm;
