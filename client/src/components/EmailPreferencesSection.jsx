import { useState } from "react";

import SpamFolderHint from "./SpamFolderHint";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

export default function EmailPreferencesSection() {
  const { user, reloadUser } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const alertsEnabled = user.email_alerts_enabled !== false;
  // Opt-in, so a missing value means off.
  const digestEnabled = user.email_digest_enabled === true;
  const anyEnabled = alertsEnabled || digestEnabled;

  // Sends only the changed preference, so the other keeps its stored value.
  const savePreference = (field) => async (event) => {
    setErrorMessage("");
    setIsSaving(true);

    try {
      await api.patch("/auth/me/email-preferences", {
        [field]: event.target.checked,
      });

      await reloadUser();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to save email settings"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="account-card" aria-labelledby="email-preferences-title">
      <span className="workspace-eyebrow">NOTIFICATIONS</span>
      <h2 id="email-preferences-title" className="mt-2 text-lg font-bold">
        Email notifications
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        Alerts always show up in the app. Choose which emails you also want
        to get.
      </p>

      <label className="mt-5 flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={alertsEnabled}
          onChange={savePreference("emailAlertsEnabled")}
          disabled={isSaving}
          className="h-4 w-4 accent-blue-600"
        />
        Email me when an alert is triggered
      </label>

      <label className="mt-4 flex items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={digestEnabled}
          onChange={savePreference("emailDigestEnabled")}
          disabled={isSaving}
          className="mt-0.5 h-4 w-4 accent-blue-600"
        />
        <span>
          Email me a daily summary of my watchlist
          <span className="mt-1 block font-normal text-gray-500">
            Sent after the US market closes on trading days. An AI model
            explains the unusual moves, and alerts close to triggering are
            listed.
          </span>
        </span>
      </label>

      {anyEnabled && user.email_verified_at && (
        <SpamFolderHint className="mt-3">
          No emails arriving? Check your spam or junk folder, and mark one as
          not spam so the next ones reach your inbox.
        </SpamFolderHint>
      )}

      {anyEnabled && !user.email_verified_at && (
        <p className="mt-3 text-sm text-gray-500">
          Confirm your email address first. Until then, no emails are sent
          and alerts are shown only in the app.
        </p>
      )}

      {errorMessage && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
