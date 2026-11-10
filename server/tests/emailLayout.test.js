const { renderEmail } = require("../services/emailLayout");

describe("email layout", () => {
  test("renders the heading, text, button and footnote", () => {
    const html = renderEmail({
      preheader: "Preview text",
      heading: "Reset your password",
      paragraphs: ["First paragraph", "Second paragraph"],
      button: {
        label: "Choose a new password",
        url: "https://example.com/reset?token=abc&x=1",
      },
      footnote: "The link expires in one hour.",
    });

    expect(html).toContain("Preview text");
    expect(html).toContain("Reset your password");
    expect(html).toContain("First paragraph");
    expect(html).toContain("Second paragraph");
    expect(html).toContain("Choose a new password");
    expect(html).toContain('href="https://example.com/reset?token=abc&amp;x=1"');
    expect(html).toContain("The link expires in one hour.");
  });

  test("escapes HTML in every value", () => {
    const html = renderEmail({
      preheader: "<b>preheader</b>",
      heading: "<script>alert(1)</script>",
      highlight: 'AAPL "<img src=x>"',
      paragraphs: ["<i>text</i>"],
      button: { label: "<u>label</u>", url: 'https://example.com/"><script>' },
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<u>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("AAPL &quot;&lt;img src=x&gt;&quot;");
  });

  test("leaves out the optional parts", () => {
    const html = renderEmail({ preheader: "Preview", heading: "Heading" });

    expect(html).not.toContain("<a href");
    expect(html).not.toContain("border-left: 4px");
  });
});
