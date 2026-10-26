import { useState } from "react";
import { Link } from "react-router";

import FormField from "../components/FormField";
import AccountPage from "../components/AccountPage";
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
    <AccountPage title="Change password" description="Keep your account secure with a strong, unique password.">
      <section className="account-card password-card" aria-labelledby="password-form-title">
      <h2 id="password-form-title" className="text-lg font-bold">Update your password</h2>
      <p id="password-guidance" className="mt-2 mb-6 text-sm text-gray-500">Use 8–128 characters. Your other devices will be signed out after the change.</p>
      <form onSubmit={handleSubmit} aria-busy={isSubmitting} aria-describedby="password-guidance">
        <fieldset disabled={isSubmitting}>
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

        </fieldset>

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
        <Link to="/account" className="text-blue-700 underline">
          Back to my profile
        </Link>
      </p>
    </section>
    </AccountPage>
  );
}

export default ChangePassword;
