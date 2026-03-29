const test = require("node:test");
const assert = require("node:assert/strict");
const { formatResults } = require("../lib/formatters");

test("formatResults emits markdown for generated candidates", () => {
  const output = formatResults({
    kind: "generate",
    mode: "hack",
    tlds: ["st", "se"],
    candidatePool: 4,
    emitted: 2,
    candidates: [
      {
        word: "chemist",
        domain: "chemi.st",
        score: 65,
      },
    ],
  });

  assert.match(output, /# Generated Domain Hack Candidates/);
  assert.match(output, /chemi\.st/);
});

test("formatResults emits markdown for checked results with registrar metadata", () => {
  const output = formatResults({
    kind: "check",
    mode: "hack",
    tlds: ["st"],
    checked: 3,
    candidatePool: 3,
    available: 1,
    unknown: 0,
    results: [
      {
        word: "chemist",
        domain: "chemi.st",
        definition: "A scientist or expert in chemistry.",
        definitionSource: "https://en.wiktionary.org/wiki/chemist",
        registration_provider: "Namecheap",
        registration_url: "https://example.test",
        price: 18.48,
      },
    ],
  });

  assert.match(output, /Register via \[Namecheap\]/);
  assert.match(output, /Renewal: \$18.48/);
});

test("formatResults emits json when requested", () => {
  const output = formatResults({
    kind: "prices",
    items: [{ tld: "com", annual_price_usd: 18.48 }],
  }, { format: "json" });
  const parsed = JSON.parse(output);
  assert.equal(parsed.items[0].tld, "com");
});
