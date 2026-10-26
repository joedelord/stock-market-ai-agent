const nodemailer = require("nodemailer");

const logger = require("../utils/logger");

const APP_NAME = "Stock Market AI";

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

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const sendEmail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("No email provider is configured (SMTP_HOST is missing)");
    }

    logger.info({ to, subject, text }, "Email not sent, SMTP_HOST is not set");
    return undefined;
  }

  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
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
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${escapeHtml(resetUrl)}">Choose a new password</a></p>
      <p>The link expires in one hour. If you did not ask for this, you can ignore this email.</p>
    `,
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
    html: `
      <p>The password of your account was just changed and you were logged out on other devices.</p>
      <p>If this was not you, <a href="${escapeHtml(forgotPasswordUrl)}">reset your password</a> right away.</p>
    `,
  });
};

const sendAlertNotificationEmail = async (email, message) => {
  const alertsUrl = `${process.env.CLIENT_ORIGIN}/alerts`;

  return sendEmail({
    to: email,
    subject: `${APP_NAME}: stock alert triggered`,
    text: `${message}\n\nManage your alerts: ${alertsUrl}`,
    html: `
      <h1>Stock alert</h1>
      <p>${escapeHtml(message)}</p>
      <p><a href="${escapeHtml(alertsUrl)}">Manage your alerts</a></p>
    `,
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAlertNotificationEmail,
};
