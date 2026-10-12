const pool = require("../config/db");

// Replaces any earlier reset token, so only the latest link works.
const createResetToken = async (userId, tokenHash, expiresAt) => {
  await pool.query(
    `WITH removed AS (
       DELETE FROM password_reset_tokens
       WHERE user_id = $1
     )
     INSERT INTO password_reset_tokens (
       user_id,
       token_hash,
       expires_at
     )
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
};

// Consumes the token and sets the new password in one transaction. Bumping
// the token version logs the user out everywhere. Returns null when the token
// is unknown, used or expired.
const resetPasswordWithToken = async (tokenHash, passwordHash) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `DELETE FROM password_reset_tokens
       WHERE token_hash = $1
         AND expires_at > CURRENT_TIMESTAMP
       RETURNING user_id`,
      [tokenHash],
    );

    const resetToken = tokenResult.rows[0];

    if (!resetToken) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE users
       SET
         password_hash = $1,
         token_version = token_version + 1
       WHERE id = $2`,
      [passwordHash, resetToken.user_id],
    );

    await client.query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1",
      [resetToken.user_id],
    );

    await client.query("COMMIT");

    return resetToken.user_id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createResetToken,
  resetPasswordWithToken,
};
