import { useState } from "react";

import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

export default function EmailVerificationBanner() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user || user.email_verified_at) return null;

  async function handleResend() {
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      await api.post("/auth/resend-verification");
      setMessage(`We sent a new link to ${user.email}.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to send verification email"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Email verification" className="border-b border-amber-300 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:px-8">
        <p>Confirm your email address to get stock alerts by email. Check your inbox for the link.</p>
        <button type="button" disabled={busy} onClick={handleResend} className="font-semibold text-amber-900 underline disabled:opacity-60">
          {busy ? "Sending…" : "Resend email"}
        </button>
        {message && <p role="status">{message}</p>}
        {errorMessage && <p role="alert" className="text-red-700">{errorMessage}</p>}
      </div>
    </section>
  );
}
