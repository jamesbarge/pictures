import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./title-patterns";

describe("decodeHtmlEntities", () => {
  it("decodes &amp; to &", () => {
    expect(decodeHtmlEntities("Salt &amp; Pepper")).toBe("Salt & Pepper");
  });

  it("decodes &quot; to double quote", () => {
    expect(decodeHtmlEntities("&quot;The Long Goodbye&quot;")).toBe(
      '"The Long Goodbye"',
    );
  });

  it("decodes &#39; to apostrophe", () => {
    expect(decodeHtmlEntities("Ocean&#39;s Eleven")).toBe("Ocean's Eleven");
  });

  it("decodes &lt; and &gt; to angle brackets", () => {
    expect(decodeHtmlEntities("&lt;Untitled&gt;")).toBe("<Untitled>");
  });

  it("decodes multiple entities in one string", () => {
    expect(decodeHtmlEntities("Salt &amp; Pepper &amp; Eggs")).toBe(
      "Salt & Pepper & Eggs",
    );
  });

  it("leaves non-encoded text unchanged", () => {
    expect(decodeHtmlEntities("Plain Title")).toBe("Plain Title");
  });

  it("decodes common punctuation and spacing entities", () => {
    expect(decodeHtmlEntities("Cool&nbsp;Title")).toBe("Cool Title");
    expect(decodeHtmlEntities("It&rsquo;s &lsquo;alive&rsquo;")).toBe(
      "It’s ‘alive’",
    );
    expect(decodeHtmlEntities("Wait&hellip; now&mdash;go")).toBe(
      "Wait… now—go",
    );
  });

  it("decodes decimal and hexadecimal numeric entities", () => {
    expect(decodeHtmlEntities("Q&#38;A")).toBe("Q&A");
    expect(decodeHtmlEntities("Q&#x26;A")).toBe("Q&A");
    expect(decodeHtmlEntities("&#8217;")).toBe("’");
  });

  it("repairs HTML-encoded UTF-8 mojibake", () => {
    expect(
      decodeHtmlEntities("S&Atilde;&iexcl;t&Atilde;&iexcl;ntang&Atilde;&sup3;"),
    ).toBe("Sátántangó");
  });

  it("leaves unknown and invalid entities unchanged", () => {
    expect(decodeHtmlEntities("Caf&eacute;")).toBe("Caf&eacute;");
    expect(decodeHtmlEntities("Bad &#99999999; entity")).toBe(
      "Bad &#99999999; entity",
    );
  });
});
