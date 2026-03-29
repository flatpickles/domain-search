const test = require("node:test");
const assert = require("node:assert/strict");
const { checkCandidates, generateCandidates, searchDomains } = require("../lib/search");
const { getTldPricing } = require("../lib/pricing");

test("generateCandidates uses bundled price filters when explicit tlds are absent", () => {
  const generated = generateCandidates({
    mode: "exact",
    words: ["sunrise"],
    maxPrice: 20,
  });

  assert.ok(generated.tlds.includes("com"));
  assert.ok(!generated.tlds.includes("io"));
});

test("checkCandidates preserves metadata and can include unknown results", async () => {
  const summary = await checkCandidates({
    candidates: [
      { mode: "hack", word: "chemist", domain: "chemi.st", label: "chemi", tld: "st", score: 10 },
      { mode: "hack", word: "mystery", domain: "unknown.st", label: "unknown", tld: "st", score: 9 },
    ],
    showUnknown: true,
    progressFormat: "silent",
    checkDomainFn: async (domain) => ({
      domain,
      status: domain === "unknown.st" ? "UNKNOWN" : "AVAILABLE",
    }),
  });

  assert.equal(summary.available, 1);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.results[0].word, "chemist");
  assert.equal(summary.results[1].status, "UNKNOWN");
  assert.ok(summary.results[0].registration_url);
});

test("searchDomains combines generate and check phases", async () => {
  const summary = await searchDomains({
    mode: "exact",
    words: ["sunrise"],
    tlds: ["com"],
    limit: 1,
    progressFormat: "silent",
    checkDomainFn: async (domain) => ({
      domain,
      status: "AVAILABLE",
    }),
  });

  assert.equal(summary.kind, "search");
  assert.equal(summary.results.length, 1);
  assert.equal(summary.results[0].domain, "sunrise.com");
});

test("getTldPricing can return explicit unknown TLD placeholders", () => {
  const pricing = getTldPricing({ tlds: ["madeup"] });
  assert.equal(pricing.items[0].tld, "madeup");
  assert.equal(pricing.items[0].annual_price_usd, null);
});
