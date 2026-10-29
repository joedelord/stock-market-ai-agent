require("../config/env");

const { generateStockAnalysis } = require("../services/groqService");
const { checkAnalysis } = require("../evals/analysisChecks");
const { SCENARIOS } = require("../evals/analysisScenarios");

// The Groq free tier allows ~1000 output tokens a minute and each request
// reserves 500, so two requests a minute is the safe pace.
const DEFAULT_DELAY_MS = 30_000;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readOption = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

// A busy provider is not a prompt failure, so it gets one retry.
const generateWithRetry = async (input) => {
  try {
    return await generateStockAnalysis(input);
  } catch (error) {
    if (!error.rateLimited) throw error;

    const seconds = Number(error.retryAfter) || DEFAULT_RETRY_AFTER_SECONDS;
    console.log(`  Groq is busy, retrying in ${seconds}s...`);
    await wait(seconds * 1000);

    return generateStockAnalysis(input);
  }
};

// Usage: npm run eval:analysis [-- --only=news-available,prompt-injection] [--delay=30000] [--verbose]
const runAnalysisEval = async () => {
  try {
    const only = readOption("only")?.split(",");
    const delayMs = Number(readOption("delay") ?? DEFAULT_DELAY_MS);
    const verbose = process.argv.includes("--verbose");

    const scenarios = only
      ? SCENARIOS.filter((scenario) => only.includes(scenario.name))
      : SCENARIOS;

    if (scenarios.length === 0) throw new Error("No matching scenarios");

    console.log(
      `Running ${scenarios.length} scenarios against ${process.env.GROQ_MODEL}, ${delayMs / 1000}s apart.\n`,
    );

    const results = [];

    for (const [index, scenario] of scenarios.entries()) {
      if (index > 0) await wait(delayMs);

      let failures;
      let analysis;

      try {
        analysis = await generateWithRetry(scenario.input);
        failures = checkAnalysis(analysis, scenario.expect, scenario.input);
      } catch (error) {
        // Invalid JSON or citations are rejected by groqService, which also
        // counts as a failed scenario.
        failures = [`Request failed: ${error.message}${error.cause ? ` (${error.cause.message})` : ""}`];
      }

      results.push({ scenario, failures });

      console.log(`${failures.length === 0 ? "PASS" : "FAIL"}  ${scenario.name}: ${scenario.description}`);
      failures.forEach((failure) => console.log(`      - ${failure}`));

      if (verbose && analysis) {
        Object.entries(analysis.sections).forEach(([key, text]) => {
          console.log(`      ${key}: ${text}`);
        });
        console.log(`      citedArticles: [${analysis.citedArticles.join(", ")}]`);
      }
    }

    const failed = results.filter((result) => result.failures.length > 0);
    console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`);

    if (failed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

runAnalysisEval();
