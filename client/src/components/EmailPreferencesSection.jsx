import { useState } from "react";

import SpamFolderHint from "./SpamFolderHint";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

export default function EmailPreferencesSection() {
  const { user, reloadUser } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const enabled = user.email_alerts_enabled !== false;

  const handleChange = async (event) => {
    setErrorMessage("");
    setIsSaving(true);

    try {
      await api.patch("/auth/me/email-preferences", {
        emailAlertsEnabled: event.target.checked,
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
        Alerts always show up in the app. Choose whether you also get an email
        when one is triggered.
      </p>

      <label className="mt-5 flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleChange}
          disabled={isSaving}
          className="h-4 w-4 accent-blue-600"
        />
        Email me when an alert is triggered
      </label>

      {enabled && user.email_verified_at && (
        <SpamFolderHint className="mt-3">
          No alert emails arriving? Check your spam or junk folder, and mark
          one as not spam so the next ones reach your inbox.
        </SpamFolderHint>
      )}

      {enabled && !user.email_verified_at && (
        <p className="mt-3 text-sm text-gray-500">
          Confirm your email address first. Until then, alerts are shown only
          in the app.
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
