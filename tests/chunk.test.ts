import { describe, expect, it } from "vitest";
import { chunkSections, htmlToSections } from "@/lib/ingest/chunk";

const doc = {
  id: "p519",
  title: "Pub 519",
  url: "https://www.irs.gov/publications/p519",
};

const HTML = `
<html><body>
  <nav>Skip to main content · Menu</nav>
  <main>
    <h1>Publication 519</h1>
    <p>Intro paragraph.</p>
    <h2 id="en_US_2025_publink1000222000">Substantial Presence Test</h2>
    <p>You will be considered a U.S. resident if you are physically present for at least 31 days.</p>
    <script>trackSomething()</script>
    <ul><li>All the days in the current year</li><li>1/3 of the days in the first year before</li></ul>
    <h3 id="students">Students</h3>
    <p>Do not count days for which you are an exempt individual.</p>
  </main>
  <footer>Footer links</footer>
</body></html>`;

describe("htmlToSections", () => {
  it("splits main content by headings and keeps anchors", () => {
    const s = htmlToSections(HTML);
    expect(s.map((x) => x.heading)).toEqual([
      "Publication 519",
      "Substantial Presence Test",
      "Students",
    ]);
    expect(s[1].anchor).toBe("en_US_2025_publink1000222000");
    expect(s[1].text).toMatch(/at least 31 days/);
    expect(s[1].text).toMatch(/1\/3 of the days/);
  });

  it("drops nav, footer and scripts", () => {
    const all = htmlToSections(HTML)
      .map((s) => s.text)
      .join(" ");
    expect(all).not.toMatch(/Skip to main|Footer links|trackSomething/);
  });
});

describe("chunkSections", () => {
  it("makes one chunk per short section with a deep-link citation", () => {
    const chunks = chunkSections(doc, htmlToSections(HTML));
    const spt = chunks.find((c) => c.section === "Substantial Presence Test")!;
    expect(spt.url).toBe(
      "https://www.irs.gov/publications/p519#en_US_2025_publink1000222000",
    );
    expect(spt.content.startsWith("Substantial Presence Test\n")).toBe(true);
    expect(spt.id).toMatch(/^p519:/);
  });

  it("splits long sections on paragraph boundaries under the size limit", () => {
    const para = "The IRS counts every day you are present. ".repeat(20).trim();
    const long = [
      { heading: "Long", anchor: "long", text: [para, para, para, para].join("\n\n") },
    ];
    const chunks = chunkSections(doc, long, { maxChars: 1200, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks)
      expect(c.content.length).toBeLessThanOrEqual(1200 + "Long\n".length);
    expect(chunks.every((c) => c.content.startsWith("Long\n"))).toBe(true);
  });

  it("produces stable ids for the same input", () => {
    const a = chunkSections(doc, htmlToSections(HTML)).map((c) => c.id);
    const b = chunkSections(doc, htmlToSections(HTML)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("never drops text from a single over-long sentence", () => {
    const run = "a".repeat(2500);
    const chunks = chunkSections(doc, [{ heading: "H", anchor: "", text: run }], {
      maxChars: 1000,
      overlapChars: 0,
    });
    expect(chunks.map((c) => c.content.slice(2)).join("")).toBe(run);
  });

  it("skips empty sections", () => {
    expect(chunkSections(doc, [{ heading: "Empty", anchor: "", text: "  " }])).toEqual(
      [],
    );
  });
});
