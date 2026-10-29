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

    expect(
      checkAnalysis(analysis({ movingAverages: "The price is currently trading above SMA20." })),
    ).toEqual(['Describes data as live in movingAverages: "currently trading"']);
  });

  test("flags internal names copied from the prompt", () => {
    const text = "News was not found, according to news.status, and leave citedArticles empty.";

    expect(checkAnalysis(analysis({ newsContext: text }))).toEqual([
      'Internal name in newsContext: "news.status"',
    ]);
  });

  test("allows the limitations to say the data is not live", () => {
    expect(
      checkAnalysis(analysis({ limitations: "This is not real-time data." })),
    ).toEqual([]);
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

  describe("number check", () => {
    const input = {
      metrics: {
        latestClose: 104,
        periodChangePercent: 3.8723,
        sma20: 1234.5678,
        dayMovement: { changePercent: -3.5 },
      },
      news: {
        articles: [{ title: "Apple cuts forecast by 7.5%", summary: "" }],
      },
    };

    test("accepts supplied numbers at any rounding, sign or format", () => {
      const text =
        "The price rose 3.87% (about 3.9 percent, or 4%) to 104.00, and fell 3.5% on " +
        "2026-10-20 at 19:45. SMA20 is 1,234.57 over 50 points [1]. A 7.5% cut was reported.";

      expect(checkAnalysis(analysis({ priceMovement: text }), {}, input)).toEqual([]);
    });

    test("flags numbers that are not in the supplied data", () => {
      const text = "The price rose 4.2% to 104.50, and 3.86% over the period.";

      expect(checkAnalysis(analysis({ priceMovement: text }), {}, input)).toEqual([
        'Number not in the supplied data: "4.2%"',
        'Number not in the supplied data: "104.50"',
        'Number not in the supplied data: "3.86%"',
      ]);
    });

    test("is skipped without the input", () => {
      expect(checkAnalysis(analysis({ priceMovement: "It rose 9.99%." }))).toEqual([]);
    });
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
