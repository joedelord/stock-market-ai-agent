const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const REQUEST_TIMEOUT_MS = 15_000;
// Access tokens last an hour. Refreshing a minute early avoids sending with a
// token that expires while the request is on its way.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const UNAUTHORIZED = 401;

let cachedToken = null;

const isGmailApiConfigured = () =>
  Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN,
  );

const clearAccessToken = () => {
  cachedToken = null;
};

// Google's message (e.g. "invalid_grant") makes a revoked or expired refresh
// token easy to spot in the logs.
const readErrorDetail = async (response) => {
  try {
    const body = await response.json();
    return body.error_description || body.error?.message || body.error;
  } catch {
    return undefined;
  }
};

const requestFailedError = async (action, response) => {
  const detail = await readErrorDetail(response);
  const error = new Error(
    `Gmail ${action} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
  );

  // Lets the caller tell a rate limit (429) from a broken message.
  error.status = response.status;

  return error;
};

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw await requestFailedError("token request", response);
  }

  const { access_token: accessToken, expires_in: expiresIn } =
    await response.json();

  cachedToken = {
    value: accessToken,
    expiresAt: Date.now() + expiresIn * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  };

  return accessToken;
};

// Sends a complete MIME message, so nodemailer can keep building the emails.
const sendRawEmail = async (rawMessage) => {
  const accessToken = await getAccessToken();

  const response = await fetch(SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: Buffer.from(rawMessage).toString("base64url") }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // The token may have been revoked early. The next email fetches a new one.
    if (response.status === UNAUTHORIZED) {
      clearAccessToken();
    }

    throw await requestFailedError("send", response);
  }

  return response.json();
};

module.exports = {
  isGmailApiConfigured,
  clearAccessToken,
  getAccessToken,
  sendRawEmail,
};
