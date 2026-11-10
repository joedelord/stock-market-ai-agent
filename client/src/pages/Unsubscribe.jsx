import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import AuthPage from "../components/AuthPage";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

// Asks before unsubscribing, because email link scanners open every link in
// a message and would otherwise turn alert emails off on their own.
function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { isAuthenticated, reloadUser } = useAuth();

  const [status, setStatus] = useState(token ? "confirm" : "invalid");
  const [errorMessage, setErrorMessage] = useState("");

  const handleUnsubscribe = async () => {
    setStatus("sending");

    try {
      await api.post(`/auth/unsubscribe?token=${encodeURIComponent(token)}`);

      setStatus("done");

      if (isAuthenticated) {
        reloadUser();
      }
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Failed to unsubscribe from alert emails"),
      );
      setStatus("failed");
    }
  };

  const settingsLink = (
    <Link to="/account" className="text-blue-700 underline">
      {isAuthenticated ? "Go to my profile" : "Log in"}
    </Link>
  );

  if (status === "invalid") {
    return (
      <AuthPage title="Unsubscribe">
        <p role="alert" className="text-red-500">
          This unsubscribe link is not valid.
        </p>

        <p className="mt-4 text-sm">
          You can turn alert emails off in your profile. {settingsLink}
        </p>
      </AuthPage>
    );
  }

  if (status === "done") {
    return (
      <AuthPage title="Unsubscribe">
        <p role="status" className="text-green-700">
          You will no longer get alert emails. Your alerts still show up in
          the app.
        </p>

        <p className="mt-4 text-sm">
          Changed your mind? You can turn them back on in your profile.{" "}
          {settingsLink}
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Unsubscribe">
      <p>
        Stop getting an email each time one of your stock alerts is triggered?
        Your alerts keep working and still show up in the app.
      </p>

      {status === "failed" && (
        <p role="alert" className="mt-4 text-red-500">
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        onClick={handleUnsubscribe}
        disabled={status === "sending"}
        className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {status === "sending" ? "Unsubscribing…" : "Turn off alert emails"}
      </button>
    </AuthPage>
  );
}

export default Unsubscribe;
