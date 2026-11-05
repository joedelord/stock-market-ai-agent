import { useState } from "react";
import { useNavigate } from "react-router";

import FormField from "./FormField";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../services/errors";

export default function DeleteAccountSection() {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancel = () => {
    setIsConfirming(false);
    setPassword("");
    setErrorMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await deleteAccount(password);

      navigate("/", { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to delete account"));
      setIsSubmitting(false);
    }
  };

  return (
    <section className="account-card" aria-labelledby="delete-account-title">
      <span className="workspace-eyebrow">DANGER ZONE</span>
      <h2 id="delete-account-title" className="mt-2 text-lg font-bold">
        Delete account
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        Permanently removes your account, watchlist, alerts and notifications.
        This cannot be undone.
      </p>

      {!isConfirming ? (
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="mt-5 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Delete my account
        </button>
      ) : (
        <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="mt-5">
          <fieldset disabled={isSubmitting}>
            <FormField
              id="deleteAccountPassword"
              label="Enter your password to confirm"
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </fieldset>

          {errorMessage && (
            <p className="mt-2 text-red-500" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Deleting..." : "Permanently delete account"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="text-sm text-gray-600 underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
