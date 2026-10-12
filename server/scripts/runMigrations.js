require("../config/env");

const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

const migrationsDirectory = path.join(__dirname, "../migrations");

const runMigrations = async () => {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = fs
      .readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const filename of files) {
      const migrationExists = await client.query(
        "SELECT id FROM migrations WHERE filename = $1",
        [filename],
      );

      if (migrationExists.rows.length > 0) {
        console.log(`Skipped: ${filename}`);
        continue;
      }

      const filePath = path.join(migrationsDirectory, filename);
      const sql = fs.readFileSync(filePath, "utf8");

      console.log(`Running: ${filename}`);

      try {
        await client.query("BEGIN");
        await client.query(sql);

        await client.query("INSERT INTO migrations (filename) VALUES ($1)", [
          filename,
        ]);

        await client.query("COMMIT");

        console.log(`Completed: ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("All migrations completed.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations();
