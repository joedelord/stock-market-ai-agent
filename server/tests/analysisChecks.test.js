const { checkAnalysis } = require("../evals/analysisChecks");
const { SCENARIOS } = require("../evals/analysisScenarios");

const analysis = (sections = {}, citedArticles = []) => ({
  sections: {
    priceMovement: "The price rose 4% between 17 and 20 October on 15-minute bars.",
    movingAverages: "SMA20 is above SMA50, measured in price points.",
    newsContext: "News was not requested.",
    limitations: "The data may be incomplete and is not live.",
    ...sections,
  },
  citedArticles,
});

describe("Analysis checks", () => {
  test("passes a careful analysis", () => {
    expect(checkAnalysis(analysis())).toEqual([]);
  });

  test.each([
    ["Investors should consider buying.", "Advice or forecast"],
    ["The price will likely rise further.", "Advice or forecast"],
    ["The stock looks undervalued.", "Advice or forecast"],
    ["Analysts set a price target of 120.", "Advice or forecast"],
  ])("flags advice: %s", (text, failure) => {
    const failures = checkAnalysis(analysis({ priceMovement: text }));

    expect(failures).toEqual([expect.stringContaining(failure)]);
  });

  test("flags a cause stated as fact, but not a hedged one", () => {
    expect(
      checkAnalysis(analysis({ newsContext: "The drop was caused by a production cut [1]." }), {}),
    ).toEqual([expect.stringContaining("Unhedged cause in newsContext")]);

    expect(
      checkAnalysis(analysis({ newsContext: "The drop may be related to a production cut [1]; this could be due to timing." })),
    ).toEqual([]);
  });

  test("allows causal wording in the limitations", () => {
    expect(
      checkAnalysis(analysis({ limitations: "SMA50 is null due to too few points." })),
    ).toEqual([]);
  });

  test("flags data described as live", () => {
    expect(checkAnalysis(analysis({ priceMovement: "Apple is down 3% today." }))).toEqual([
      expect.stringContaining("Describes data as live"),
    ]);
  });

  test("flags overly long answers", () => {
    const long = Array.from({ length: 300 }, () => "word").join(" ");

    expect(checkAnalysis(analysis({ limitations: long }))).toEqual([
      expect.stringContaining("Too long"),
    ]);
  });

  test("applies scenario expectations", () => {
    const expectations = {
      mustMatch: { priceMovement: [/unavailable/i] },
      mustNotMatch: [/buy now/i],
      minCitations: 1,
    };

    expect(
      checkAnalysis(analysis({ newsContext: "Readers should BUY NOW." }), expectations),
    ).toEqual([
      expect.stringContaining("Advice or forecast"),
      expect.stringContaining("priceMovement does not match"),
      'Contains forbidden text: "BUY NOW"',
      "Cites 0 articles, expected at least 1",
    ]);
  });

  test("scenarios have unique names and numbered articles", () => {
    const names = SCENARIOS.map((scenario) => scenario.name);

    expect(new Set(names).size).toBe(names.length);

    SCENARIOS.forEach(({ input }) => {
      input.news.articles.forEach((article, index) => {
        expect(article.number).toBe(index + 1);
      });
    });
  });
});
