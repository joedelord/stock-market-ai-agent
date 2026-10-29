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

// A number with an optional % sign, but not digits that belong to a word
// (SMA20), a date (2026-10-17), a time (19:45) or a citation ([1]).
const NUMBER_PATTERN = /(?<![\w.:,[])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?![\w:\-\]])(\s?%|\s?percent)?/gi;

// Field names and status codes from the input or prompt. Seeing one in the
// text usually means the model copied a prompt line instead of answering.
const INTERNAL_NAME_PATTERN =
  /\b(news\.status|citedArticles|dayMovement|changePercent|isSignificant|thresholdMethod|previous(Bar|Session)Close|latestBarChangePercent|not_requested|not_configured|no_results)\b/;

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

const readNumbers = (text) =>
  [...text.matchAll(NUMBER_PATTERN)].map(([match, whole, decimals, percent]) => ({
    text: match.trim(),
    value: Number(`${whole.replaceAll(",", "")}.${decimals ?? "0"}`),
    decimals: decimals?.length ?? 0,
    isPercent: Boolean(percent),
  }));

const collectNumbers = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectNumbers);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectNumbers);

  return [];
};

// Metrics are unrounded, so a written number passes if it is any supplied
// value rounded to the shown precision. Signs are ignored, because "fell
// 3.5%" describes -3.5. Plain integers are skipped: they are mostly dates,
// counts and periods. Numbers quoted from articles are allowed too.
const findUnsupportedNumbers = (text, input) => {
  const articleText = (input.news?.articles ?? [])
    .map((article) => `${article.title} ${article.summary}`)
    .join(" ");
  const supplied = [
    ...collectNumbers(input.metrics),
    ...readNumbers(articleText).map((number) => number.value),
  ].map(Math.abs);

  return readNumbers(text)
    .filter((number) => number.decimals > 0 || number.isPercent)
    .filter((number) => {
      const tolerance = 0.5 * 10 ** -number.decimals + 1e-9;
      return !supplied.some((value) => Math.abs(value - number.value) <= tolerance);
    })
    .map((number) => number.text);
};

const splitSentences = (text) => text.split(/(?<=[.!?])\s+/);

const allText = (sections) => Object.values(sections).join("\n");

// Returns a list of human-readable failures; empty means the analysis passed.
// With the model input, numbers are also checked against the supplied data.
const checkAnalysis = (analysis, expectations = {}, input = null) => {
  const failures = [];
  const { sections, citedArticles } = analysis;
  const text = allText(sections);

  const words = countWords(text);
  if (words > MAX_WORDS) failures.push(`Too long: ${words} words (max ${MAX_WORDS})`);

  if (input) {
    findUnsupportedNumbers(text, input).forEach((number) => {
      failures.push(`Number not in the supplied data: "${number}"`);
    });
  }

  Object.entries(sections).forEach(([key, section]) => {
    const name = section.match(INTERNAL_NAME_PATTERN);
    if (name) failures.push(`Internal name in ${key}: "${name[0]}"`);
  });

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
  });

  // Not the limitations, where "this is not real-time data" is correct.
  ["priceMovement", "movingAverages", "newsContext"].forEach((key) => {
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
