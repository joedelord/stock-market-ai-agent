const logger = require("./logger");

// Placeholder delivery: replace with a real email provider (for example
// Nodemailer, Resend or Amazon SES) before going to production.
const sendPasswordResetEmail = async (email, resetUrl) => {
  if (process.env.NODE_ENV === "production") {
    logger.error(
      { email },
      "Password reset requested, but no email provider is configured",
    );
    return;
  }

  logger.info({ email, resetUrl }, "Password reset link (development only)");
};

module.exports = {
  sendPasswordResetEmail,
};
