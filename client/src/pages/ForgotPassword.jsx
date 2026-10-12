import { useState } from "react";
import { Link } from "react-router";

import FormField from "../components/FormField";
import FormPage from "../components/FormPage";
import SubmitButton from "../components/SubmitButton";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await api.post("/auth/forgot-password", { email });

      setSuccessMessage(response.data.message);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to request reset link"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormPage title="Forgot password">
      {successMessage ? (
        <p role="status" className="text-green-700">
          {successMessage}
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="mb-3 text-sm text-gray-600">
            Enter your email and we will send you a link to reset your password.
          </p>

          <FormField
            id="email"
            label="Email"
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(event) => setEmail(event.target.value)}
          />

          {errorMessage && (
            <p className="mt-2 text-red-500" role="alert">
              {errorMessage}
            </p>
          )}

          <SubmitButton isSubmitting={isSubmitting} submittingText="Sending...">
            Send reset link
          </SubmitButton>
        </form>
      )}

      <p className="mt-4 text-sm">
        <Link to="/login" className="text-blue-700 underline">
          Back to login
        </Link>
      </p>
    </FormPage>
  );
}

export default ForgotPassword;
