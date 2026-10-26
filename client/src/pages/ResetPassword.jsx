import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import FormField from "../components/FormField";
import AuthPage from "../components/AuthPage";
import SubmitButton from "../components/SubmitButton";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isReset, setIsReset] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post("/auth/reset-password", { token, password });

      setIsReset(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to reset password"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthPage title="Reset password">
        <p role="alert" className="text-red-500">
          This reset link is not valid.
        </p>

        <p className="mt-4 text-sm">
          <Link to="/forgot-password" className="text-blue-700 underline">
            Request a new link
          </Link>
        </p>
      </AuthPage>
    );
  }

  if (isReset) {
    return (
      <AuthPage title="Reset password">
        <p role="status" className="text-green-700">
          Your password has been reset.
        </p>

        <p className="mt-4 text-sm">
          <Link to="/login" className="text-blue-700 underline">
            Log in
          </Link>
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Reset password">
      <form onSubmit={handleSubmit}>
        <FormField
          id="password"
          label="New password"
          type="password"
          value={password}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          onChange={(event) => setPassword(event.target.value)}
        />

        <FormField
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          autoComplete="new-password"
          required
          className="mt-3"
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {errorMessage && (
          <p className="mt-2 text-red-500" role="alert">
            {errorMessage}
          </p>
        )}

        <SubmitButton isSubmitting={isSubmitting} submittingText="Saving...">
          Reset password
        </SubmitButton>
      </form>

      <p className="mt-4 text-sm">
        <Link to="/forgot-password" className="text-blue-700 underline">
          Request a new link
        </Link>
      </p>
    </AuthPage>
  );
}

export default ResetPassword;
