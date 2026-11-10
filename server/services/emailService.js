const nodemailer = require("nodemailer");

const logger = require("../utils/logger");
const gmailApiService = require("./gmailApiService");
const { APP_NAME, renderEmail } = require("./emailLayout");

// A public endpoint asks for this, so the result is reused for a while
// instead of contacting the provider on every request.
const HEALTH_CACHE_MS = 5 * 60 * 1000;

let healthCache = null;

// Tests never reach an SMTP server: jsonTransport builds the message without
// sending it. Without SMTP_HOST, development logs the email instead.
const createTransporter = () => {
  if (process.env.NODE_ENV === "test") {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  if (!process.env.SMTP_HOST) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === "true",

    // Mailpit needs no credentials; a real SMTP provider does.
    ...(process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        }
      : {}),
  });
};

const transporter = createTransporter();

// Builds the MIME message without sending it, for the Gmail API.
const messageBuilder = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
});

const sendEmail = async ({ to, subject, text, html, headers }) => {
  const message = {
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
    headers,
  };

  // Railway's Trial and Hobby plans block outgoing SMTP, but HTTPS works.
  if (gmailApiService.isGmailApiConfigured()) {
    const { message: rawMessage } = await messageBuilder.sendMail(message);
    return gmailApiService.sendRawEmail(rawMessage);
  }

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "No email provider is configured (set SMTP_HOST or the GMAIL_* variables)",
      );
    }

    logger.info({ to, subject, text }, "Email not sent, SMTP_HOST is not set");
    return undefined;
  }

  return transporter.sendMail(message);
};

// Contacts the provider with the configured credentials: a Gmail token
// request (which also catches a revoked refresh token) or an SMTP handshake.
// Returns "ok", "failing" or "not_configured".
const checkEmailHealth = async () => {
  if (healthCache && healthCache.expiresAt > Date.now()) {
    return healthCache.status;
  }

  let status;

  try {
    if (gmailApiService.isGmailApiConfigured()) {
      await gmailApiService.getAccessToken();
      status = "ok";
    } else if (transporter && process.env.NODE_ENV !== "test") {
      await transporter.verify();
      status = "ok";
    } else {
      status = "not_configured";
    }
  } catch (error) {
    logger.error({ err: error }, "Email delivery is not working");
    status = "failing";
  }

  healthCache = { status, expiresAt: Date.now() + HEALTH_CACHE_MS };

  return status;
};

const clearEmailHealthCache = () => {
  healthCache = null;
};

const sendEmailVerificationEmail = async (email, verifyUrl) => {
  return sendEmail({
    to: email,
    subject: `${APP_NAME}: confirm your email address`,
    text: [
      `Welcome to ${APP_NAME}!`,
      `Confirm your email address to get stock alerts by email: ${verifyUrl}`,
      "The link expires in 24 hours. If you did not create an account, you can ignore this email.",
    ].join("\n\n"),
    html: renderEmail({
      preheader: "Confirm your email address to get stock alerts by email.",
      heading: `Welcome to ${APP_NAME}!`,
      paragraphs: ["Confirm your email address to get stock alerts by email."],
      button: { label: "Confirm email address", url: verifyUrl },
      footnote:
        "The link expires in 24 hours. If you did not create an account, you can ignore this email.",
    }),
  });
};

const sendPasswordResetEmail = async (email, resetUrl) => {
  return sendEmail({
    to: email,
    subject: `${APP_NAME}: reset your password`,
    text: [
      "We received a request to reset your password.",
      `Open this link to choose a new one: ${resetUrl}`,
      "The link expires in one hour. If you did not ask for this, you can ignore this email.",
    ].join("\n\n"),
    html: renderEmail({
      preheader: "Choose a new password for your account.",
      heading: "Reset your password",
      paragraphs: [
        "We received a request to reset your password. Use the button below to choose a new one.",
      ],
      button: { label: "Choose a new password", url: resetUrl },
      footnote:
        "The link expires in one hour. If you did not ask for this, you can ignore this email.",
    }),
  });
};

const sendPasswordChangedEmail = async (email) => {
  const forgotPasswordUrl = `${process.env.CLIENT_ORIGIN}/forgot-password`;

  return sendEmail({
    to: email,
    subject: `${APP_NAME}: your password was changed`,
    text: [
      "The password of your account was just changed and you were logged out on other devices.",
      `If this was not you, reset your password right away: ${forgotPasswordUrl}`,
    ].join("\n\n"),
    html: renderEmail({
      preheader: "The password of your account was just changed.",
      heading: "Your password was changed",
      paragraphs: [
        "The password of your account was just changed and you were logged out on other devices.",
        "If this was not you, reset your password right away.",
      ],
      button: { label: "Reset password", url: forgotPasswordUrl },
      footnote: "If you made this change, you do not need to do anything.",
    }),
  });
};

const sendAlertNotificationEmail = async (email, message, unsubscribeToken) => {
  const alertsUrl = `${process.env.CLIENT_ORIGIN}/alerts`;
  const token = encodeURIComponent(unsubscribeToken);
  // The page asks for confirmation, because link scanners open every link.
  const unsubscribePageUrl = `${process.env.CLIENT_ORIGIN}/unsubscribe?token=${token}`;
  // Gmail and other providers POST here from their own "Unsubscribe" button
  // (RFC 8058). The server serves the client, so CLIENT_ORIGIN reaches /api.
  const unsubscribeApiUrl = `${process.env.CLIENT_ORIGIN}/api/auth/unsubscribe?token=${token}`;

  return sendEmail({
    to: email,
    subject: `${APP_NAME}: stock alert triggered`,
    text: [
      message,
      `Manage your alerts: ${alertsUrl}`,
      `Unsubscribe from alert emails: ${unsubscribePageUrl}`,
    ].join("\n\n"),
    html: renderEmail({
      preheader: message,
      heading: "Stock alert triggered",
      highlight: message,
      paragraphs: ["One of your price alerts was just triggered."],
      button: { label: "Manage your alerts", url: alertsUrl },
      unsubscribeUrl: unsubscribePageUrl,
    }),
    headers: {
      "List-Unsubscribe": `<${unsubscribeApiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
};

module.exports = {
  checkEmailHealth,
  clearEmailHealthCache,
  sendEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAlertNotificationEmail,
};
