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
  assert.equal(summary.results[0].candidate_type, "brandable");
  assert.equal(summary.results[0].source_type, "provided");
  assert.equal(summary.results[0].verification_status, "available");
  assert.equal(summary.results[1].status, "UNKNOWN");
  assert.equal(summary.results[1].verification_status, "unknown_needs_registrar_check");
  assert.match(summary.results[1].verification_hint, /WHOIS inconclusive/);
  assert.ok(summary.results[0].registration_url);
});

test("checkCandidates preserves provided brandable descriptions", async () => {
  const summary = await checkCandidates({
    candidates: [
      {
        mode: "exact",
        input: "leashr",
        domain: "leashr.me",
        label: "leashr",
        candidate_type: "brandable",
        source_type: "provided",
        description: "Short, upbeat dog-walking brand.",
        description_source: "agent",
      },
    ],
    withDescriptions: true,
    progressFormat: "silent",
    checkDomainFn: async () => ({
      status: "AVAILABLE",
    }),
    fetchDescriptionFn: async () => {
      throw new Error("brandable descriptions should not be fetched");
    },
  });

  assert.equal(summary.results[0].description, "Short, upbeat dog-walking brand.");
  assert.equal(summary.results[0].description_source, "agent");
  assert.equal(summary.results[0].verification_status, "available");
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

test("getTldPricing exposes broader hack-friendly price coverage under a max price", () => {
  const pricing = getTldPricing({ maxPrice: 30 });
  const tlds = new Set(pricing.items.map((item) => item.tld));

  assert.ok(tlds.has("sh"));
  assert.ok(tlds.has("in"));
  assert.ok(tlds.has("me"));
});
