// Checks for Groq analyses that the response validation in groqService cannot
// do: wording rules from the prompt. Used by scripts/evalAnalysisPrompt.js.

const MAX_WORDS = 275;

// Advice and forecasts are banned by the prompt in every section.
const ADVICE_PATTERNS = [
  /\b(you|investors|traders|readers|shareholders) (should|must)\b/i,
  /\b(we|i) recommend\b/i,
  /\brecommend(s|ed)? (buying|selling|holding)\b/i,
  /\b(strong )?(buy|sell) (signal|rating|recommendation)\b/i,
  /\bgood (time|opportunity|moment) to (buy|sell)\b/i,
  /\b(price target|target price)\b/i,
  /\b(under|over)valued\b/i,
  /\bwill (likely |probably )?(rise|fall|increase|decrease|go up|go down|rebound|recover|continue)\b/i,
  /\b(is|are) (likely|expected|poised) to (rise|fall|increase|decrease|rebound|recover)\b/i,
];

const CAUSE_PATTERN =
  /\b(caused by|driven by|triggered by|because of|as a result of|due to|led to)\b/i;
const HEDGE_PATTERN = /\b(may|might|could|possibl[ey]|perhaps|unclear|not (prove|confirm|establish))/i;

// The prompt says the quote is not live and not necessarily today's move.
const LIVE_PATTERN = /\b(today|currently trading|right now|real-time|live price)\b/i;

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

const splitSentences = (text) => text.split(/(?<=[.!?])\s+/);

const allText = (sections) => Object.values(sections).join("\n");

// Returns a list of human-readable failures; empty means the analysis passed.
const checkAnalysis = (analysis, expectations = {}) => {
  const failures = [];
  const { sections, citedArticles } = analysis;
  const text = allText(sections);

  const words = countWords(text);
  if (words > MAX_WORDS) failures.push(`Too long: ${words} words (max ${MAX_WORDS})`);

  ADVICE_PATTERNS.forEach((pattern) => {
    const match = text.match(pattern);
    if (match) failures.push(`Advice or forecast: "${match[0]}"`);
  });

  // A cause stated as fact claims more than price data or headlines can show.
  ["priceMovement", "newsContext"].forEach((key) => {
    splitSentences(sections[key]).forEach((sentence) => {
      if (CAUSE_PATTERN.test(sentence) && !HEDGE_PATTERN.test(sentence)) {
        failures.push(`Unhedged cause in ${key}: "${sentence.trim()}"`);
      }
    });

    const live = sections[key].match(LIVE_PATTERN);
    if (live) failures.push(`Describes data as live in ${key}: "${live[0]}"`);
  });

  Object.entries(expectations.mustMatch ?? {}).forEach(([key, patterns]) => {
    patterns.forEach((pattern) => {
      if (!pattern.test(sections[key])) {
        failures.push(`${key} does not match ${pattern}`);
      }
    });
  });

  (expectations.mustNotMatch ?? []).forEach((pattern) => {
    const match = text.match(pattern);
    if (match) failures.push(`Contains forbidden text: "${match[0]}"`);
  });

  if (expectations.minCitations && citedArticles.length < expectations.minCitations) {
    failures.push(
      `Cites ${citedArticles.length} articles, expected at least ${expectations.minCitations}`,
    );
  }

  return failures;
};

module.exports = {
  checkAnalysis,
  MAX_WORDS,
};
