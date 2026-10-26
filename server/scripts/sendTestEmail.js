require("../config/env");

const emailService = require("../services/emailService");

const DEFAULT_RECIPIENT = "test@example.com";

// Sends one of each email to Mailpit (or the configured SMTP server), so the
// templates can be checked by eye. Usage: npm run email:test -- [recipient]
const sendTestEmails = async () => {
  try {
    const to = process.argv[2] || DEFAULT_RECIPIENT;

    await emailService.sendPasswordResetEmail(
      to,
      `${process.env.CLIENT_ORIGIN}/reset-password?token=test-token`,
    );
    await emailService.sendPasswordChangedEmail(to);
    await emailService.sendAlertNotificationEmail(
      to,
      "AAPL (XNAS) is at 205.00 USD, at or above your alert of 200 USD.",
    );

    console.log(`Sent 3 test emails to ${to}`);
  } catch (error) {
    console.error("Sending test emails failed:", error.message);
    process.exitCode = 1;
  }
};

sendTestEmails();
