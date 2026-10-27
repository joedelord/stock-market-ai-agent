const pool = require("../config/db");

// Replaces any earlier verification token, so only the latest link works.
const createVerificationToken = async (userId, tokenHash, expiresAt) => {
  await pool.query(
    `WITH removed AS (
       DELETE FROM email_verification_tokens
       WHERE user_id = $1
     )
     INSERT INTO email_verification_tokens (
       user_id,
       token_hash,
       expires_at
     )
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
};

// Consumes the token and marks the email verified in one statement. Returns
// undefined when the token is unknown, used or expired.
const verifyEmailWithToken = async (tokenHash) => {
  const result = await pool.query(
    `WITH used_token AS (
       DELETE FROM email_verification_tokens
       WHERE token_hash = $1
         AND expires_at > CURRENT_TIMESTAMP
       RETURNING user_id
     )
     UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
     FROM used_token
     WHERE users.id = used_token.user_id
     RETURNING
       users.id`,
    [tokenHash],
  );

  return result.rows[0];
};

module.exports = {
  createVerificationToken,
  verifyEmailWithToken,
};
