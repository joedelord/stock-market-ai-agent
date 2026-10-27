require("../config/env");

const readline = require("readline");

const pool = require("../config/db");
const { createUserAccount } = require("../services/userService");
const { createUserSchema } = require("../validations/userSchemas");

// Reads a line without echoing it, so the password stays off the screen and
// out of shell history.
const promptHidden = (question) => {
  if (!process.stdin.isTTY) {
    throw new Error("Set ADMIN_PASSWORD when not running in a terminal");
  }

  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let input = "";

    const finish = (callback) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      callback();
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          return finish(() => resolve(input));
        }

        if (char === "\u0003") {
          return finish(() => reject(new Error("Cancelled")));
        }

        if (char === "\u007f" || char === "\b") {
          input = input.slice(0, -1);
        } else {
          input += char;
        }
      }
    };

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
};

const createAdmin = async () => {
  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // The line iterator buffers input, so piped answers are not lost.
    const lines = rl[Symbol.asyncIterator]();

    const ask = async (question) => {
      process.stdout.write(question);

      const { value = "" } = await lines.next();

      return value;
    };

    const username = await ask("Username: ");
    const email = await ask("Email: ");

    rl.close();

    const password =
      process.env.ADMIN_PASSWORD ?? (await promptHidden("Password: "));

    const result = createUserSchema.safeParse({
      body: {
        username,
        email,
        password,
        role: "admin",
      },
    });

    if (!result.success) {
      for (const issue of result.error.issues) {
        console.error(`${issue.path.at(-1)}: ${issue.message}`);
      }

      process.exitCode = 1;
      return;
    }

    const user = await createUserAccount({
      ...result.data.body,
      emailVerified: true,
    });

    console.log(`Created admin ${user.username} (${user.email})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

createAdmin();
