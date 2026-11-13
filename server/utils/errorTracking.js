const Sentry = require("@sentry/node");

const logger = require("./logger");

const FLUSH_TIMEOUT_MS = 2000;

let enabled = false;

// Off unless SENTRY_DSN is set, so development and tests never send events.
const initErrorTracking = () => {
  const dsn = process.env.SENTRY_DSN?.trim();

  if (!dsn || enabled) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    // Railway sets this for deployments built from GitHub.
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    // The default integrations attach request bodies (passwords, reset
    // tokens) and outgoing request URLs (the Twelve Data key is a query
    // parameter). Only these, which add no request data, are kept.
    defaultIntegrations: false,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.nodeContextIntegration(),
    ],
    // No performance tracing, so OpenTelemetry is not needed.
    skipOpenTelemetrySetup: true,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
  });

  enabled = true;
  logger.info("Error tracking enabled");
};

// context must not hold personal data: ids and names of things, not emails
// or request bodies.
const captureError = (error, context = {}) => {
  if (!enabled) return;

  Sentry.captureException(error, {
    extra: context,
  });
};

// Sends queued events before the process exits.
const flushErrors = async () => {
  if (!enabled) return;

  await Sentry.close(FLUSH_TIMEOUT_MS);
};

module.exports = {
  initErrorTracking,
  captureError,
  flushErrors,
};
