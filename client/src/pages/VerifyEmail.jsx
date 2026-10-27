import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

import AuthPage from "../components/AuthPage";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { isAuthenticated, reloadUser } = useAuth();

  const [status, setStatus] = useState(token ? "verifying" : "invalid");
  const [errorMessage, setErrorMessage] = useState("");

  // A token works only once, so StrictMode's second effect run must not send
  // it again.
  const sentToken = useRef(null);

  useEffect(() => {
    if (!token || sentToken.current === token) return;

    sentToken.current = token;

    api
      .post("/auth/verify-email", { token })
      .then(() => {
        setStatus("verified");
        reloadUser();
      })
      .catch((error) => {
        setErrorMessage(
          getErrorMessage(error, "Failed to verify email address"),
        );
        setStatus("failed");
      });
  }, [token, reloadUser]);

  const nextLink = isAuthenticated ? (
    <Link to="/stocks" className="text-blue-700 underline">
      Go to my stocks
    </Link>
  ) : (
    <Link to="/login" className="text-blue-700 underline">
      Log in
    </Link>
  );

  if (status === "verifying") {
    return (
      <AuthPage title="Verify email">
        <p role="status">Verifying your email address…</p>
      </AuthPage>
    );
  }

  if (status === "verified") {
    return (
      <AuthPage title="Verify email">
        <p role="status" className="text-green-700">
          Your email address has been verified. You will now get alerts by
          email.
        </p>

        <p className="mt-4 text-sm">{nextLink}</p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Verify email">
      <p role="alert" className="text-red-500">
        {status === "invalid"
          ? "This verification link is not valid."
          : errorMessage}
      </p>

      <p className="mt-4 text-sm">
        {isAuthenticated
          ? "You can request a new link from the banner at the top of the app."
          : "Log in to request a new link."}
      </p>

      <p className="mt-4 text-sm">{nextLink}</p>
    </AuthPage>
  );
}

export default VerifyEmail;
