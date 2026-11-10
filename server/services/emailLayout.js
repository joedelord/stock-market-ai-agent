const APP_NAME = "Stock Market AI";

// Same palette as the client (client/src/index.css).
const COLORS = {
  page: "#f1f5f9",
  card: "#ffffff",
  border: "#e2e8f0",
  heading: "#14233d",
  text: "#334155",
  muted: "#64748b",
  primary: "#2563eb",
  highlight: "#eff6ff",
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderParagraph = (text) =>
  `<p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: ${COLORS.text};">${escapeHtml(text)}</p>`;

const renderHighlight = (text) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
    <tr>
      <td style="padding: 16px 20px; background-color: ${COLORS.highlight}; border-left: 4px solid ${COLORS.primary}; border-radius: 6px; font-size: 16px; line-height: 24px; font-weight: 600; color: ${COLORS.heading};">
        ${escapeHtml(text)}
      </td>
    </tr>
  </table>`;

// A table cell with a background colour still shows a button in Outlook,
// which ignores padding and background on links.
const renderButton = ({ label, url }) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 24px;">
    <tr>
      <td style="border-radius: 8px; background-color: ${COLORS.primary};">
        <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>
  <p style="margin: 0 0 16px; font-size: 13px; line-height: 20px; color: ${COLORS.muted};">
    If the button does not work, copy this link into your browser:<br>
    <a href="${escapeHtml(url)}" style="color: ${COLORS.primary}; word-break: break-all;">${escapeHtml(url)}</a>
  </p>`;

// Inline styles only: Gmail and Outlook drop or rewrite most <style> rules.
const renderEmail = ({
  preheader,
  heading,
  paragraphs = [],
  highlight,
  button,
  footnote,
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.page};">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.page}; font-family: ${FONT_STACK};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">
            <tr>
              <td style="padding: 0 4px 16px; font-size: 18px; font-weight: 700; color: ${COLORS.heading};">
                <span style="color: ${COLORS.primary};">&#9650;</span> ${APP_NAME}
              </td>
            </tr>
            <tr>
              <td style="padding: 32px; background-color: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 12px;">
                <h1 style="margin: 0 0 16px; font-size: 22px; line-height: 30px; font-weight: 700; color: ${COLORS.heading};">${escapeHtml(heading)}</h1>
                ${highlight ? renderHighlight(highlight) : ""}
                ${paragraphs.map(renderParagraph).join("")}
                ${button ? renderButton(button) : ""}
                ${footnote ? `<p style="margin: 8px 0 0; padding-top: 16px; border-top: 1px solid ${COLORS.border}; font-size: 13px; line-height: 20px; color: ${COLORS.muted};">${escapeHtml(footnote)}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 16px 4px 0; font-size: 12px; line-height: 18px; color: ${COLORS.muted};">
                You received this email because you have an account at ${APP_NAME}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

module.exports = {
  APP_NAME,
  escapeHtml,
  renderEmail,
};
