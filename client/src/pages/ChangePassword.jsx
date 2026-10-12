import { useState } from "react";
import { Link } from "react-router";

import FormField from "../components/FormField";
import FormPage from "../components/FormPage";
import SubmitButton from "../components/SubmitButton";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      await api.patch("/auth/password", { currentPassword, newPassword });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setSuccessMessage(
        "Password changed. You have been logged out on your other devices.",
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to change password"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormPage title="Change password">
      <form onSubmit={handleSubmit}>
        <FormField
          id="currentPassword"
          label="Current password"
          type="password"
          value={currentPassword}
          autoComplete="current-password"
          required
          onChange={(event) => setCurrentPassword(event.target.value)}
        />

        <FormField
          id="newPassword"
          label="New password"
          type="password"
          value={newPassword}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          className="mt-3"
          onChange={(event) => setNewPassword(event.target.value)}
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

        {successMessage && (
          <p className="mt-2 text-green-700" role="status">
            {successMessage}
          </p>
        )}

        <SubmitButton isSubmitting={isSubmitting} submittingText="Saving...">
          Change password
        </SubmitButton>
      </form>

      <p className="mt-4 text-sm">
        <Link to="/dashboard" className="text-blue-700 underline">
          Back to dashboard
        </Link>
      </p>
    </FormPage>
  );
}

export default ChangePassword;
