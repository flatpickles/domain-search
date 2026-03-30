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

test("generateCandidates defaults to a mixed .com plus creative suffix search", () => {
  const generated = generateCandidates({
    words: ["sunrise", "chemist"],
  });

  assert.equal(generated.mode, "mixed");
  assert.equal(generated.requested_mode, null);
  assert.ok(generated.candidates.some((candidate) => candidate.domain === "sunrise.com"));
  assert.ok(generated.candidates.some((candidate) => candidate.domain === "chemi.st"));
  assert.ok(generated.candidates.some((candidate) => candidate.domain_shape === "exact"));
  assert.ok(generated.candidates.some((candidate) => candidate.domain_shape === "creative_suffix"));
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
  assert.equal(summary.results[0].registration_provider, "ST Registry");
  assert.equal(summary.results[0].registration_kind, "registry_homepage");
  assert.match(summary.results[0].registration_note, /official registry homepage/);
  assert.equal(summary.results[1].status, "UNKNOWN");
  assert.equal(summary.results[1].verification_status, "unknown_needs_registrar_check");
  assert.match(summary.results[1].verification_hint, /WHOIS inconclusive/);
  assert.ok(summary.results[0].registration_url);
});

test("checkCandidates infers creative suffix shape for plain provided domains", async () => {
  const summary = await checkCandidates({
    candidates: ["walk.in", "shear.it", "sunrise.com"],
    progressFormat: "silent",
    checkDomainFn: async () => ({ status: "AVAILABLE" }),
  });

  const byDomain = new Map(summary.results.map((item) => [item.domain, item]));

  assert.equal(byDomain.get("walk.in").mode, "hack");
  assert.equal(byDomain.get("walk.in").domain_shape, "creative_suffix");
  assert.equal(byDomain.get("shear.it").mode, "hack");
  assert.equal(byDomain.get("shear.it").domain_shape, "creative_suffix");
  assert.equal(byDomain.get("sunrise.com").domain_shape, "exact");
});

test("checkCandidates applies soft shape balance to mixed-shape inputs when limit is set", async () => {
  const summary = await checkCandidates({
    candidates: [
      { mode: "exact", domain: "alpha.com", label: "alpha", domain_shape: "exact", source_type: "provided", candidate_type: "brandable", score: 99 },
      { mode: "exact", domain: "beta.com", label: "beta", domain_shape: "exact", source_type: "provided", candidate_type: "brandable", score: 98 },
      { mode: "exact", domain: "gamma.com", label: "gamma", domain_shape: "exact", source_type: "provided", candidate_type: "brandable", score: 97 },
      { mode: "hack", domain: "alph.ae", label: "alph", tld: "ae", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 70 },
      { mode: "hack", domain: "bet.ae", label: "bet", tld: "ae", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 69 },
      { mode: "hack", domain: "gamm.ae", label: "gamm", tld: "ae", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 68 },
    ],
    limit: 4,
    progressFormat: "silent",
    checkDomainFn: async () => ({ status: "AVAILABLE" }),
  });

  assert.equal(summary.selection_policy, "soft_shape_balance");
  assert.equal(summary.results.length, 4);
  assert.ok(summary.selected_counts.exact >= 1);
  assert.ok(summary.selected_counts.creative_suffix >= 1);
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

test("checkCandidates stays score-only for single-shape inputs", async () => {
  const summary = await checkCandidates({
    candidates: [
      { mode: "exact", domain: "alpha.com", label: "alpha", domain_shape: "exact", source_type: "provided", candidate_type: "brandable", score: 99 },
      { mode: "exact", domain: "beta.com", label: "beta", domain_shape: "exact", source_type: "provided", candidate_type: "brandable", score: 98 },
    ],
    limit: 1,
    progressFormat: "silent",
    checkDomainFn: async () => ({ status: "AVAILABLE" }),
  });

  assert.equal(summary.selection_policy, "score_only");
  assert.equal(summary.selected_counts.creative_suffix, 0);
});

test("checkCandidates filters weak provided shortlist entries and re-ranks the remainder", async () => {
  const summary = await checkCandidates({
    candidates: [
      "walk.in",
      "stageforgeco.com",
      "setcraf.it",
      "sunrise.com",
    ],
    progressFormat: "silent",
    checkDomainFn: async () => ({ status: "AVAILABLE" }),
  });

  assert.deepEqual(
    summary.results.map((item) => item.domain),
    ["sunrise.com", "walk.in"],
  );
});

test("checkCandidates leaves registration link fields null for unknown TLDs", async () => {
  const summary = await checkCandidates({
    candidates: [
      {
        mode: "exact",
        input: "example",
        domain: "example.madeup",
        label: "example",
        candidate_type: "brandable",
        source_type: "provided",
      },
    ],
    progressFormat: "silent",
    checkDomainFn: async () => ({
      status: "AVAILABLE",
    }),
  });

  assert.equal(summary.results[0].registration_provider, null);
  assert.equal(summary.results[0].registration_url, null);
  assert.equal(summary.results[0].registration_kind, null);
  assert.match(summary.results[0].registration_note, /No reliable bundled registration target/);
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

test("searchDomains uses mixed mode by default", async () => {
  const summary = await searchDomains({
    words: ["sunrise", "chemist", "appraise", "walkin"],
    limit: 4,
    progressFormat: "silent",
    checkDomainFn: async (domain) => ({
      domain,
      status: "AVAILABLE",
    }),
  });

  assert.equal(summary.kind, "search");
  assert.equal(summary.mode, "mixed");
  assert.equal(summary.selection_policy, "soft_shape_balance");
  assert.ok(summary.results.some((candidate) => candidate.domain_shape === "exact"));
  assert.ok(summary.results.some((candidate) => candidate.domain_shape === "creative_suffix"));
  assert.ok(summary.selected_counts.exact >= 1);
  assert.ok(summary.selected_counts.creative_suffix >= 1);
});

test("searchDomains stays score-only in explicit exact mode", async () => {
  const summary = await searchDomains({
    mode: "exact",
    words: ["sunrise", "sunset"],
    limit: 1,
    progressFormat: "silent",
    checkDomainFn: async (domain) => ({
      domain,
      status: "AVAILABLE",
    }),
  });

  assert.equal(summary.mode, "exact");
  assert.equal(summary.selection_policy, "score_only");
});

test("searchDomains bounds checking before exhausting the candidate pool", async () => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const words = Array.from({ length: 120 }, (_, index) => (
    `b${letters[Math.floor(index / 26) % 26]}${letters[index % 26]}nd`
  ));
  const summary = await searchDomains({
    mode: "exact",
    words,
    limit: 2,
    progressFormat: "silent",
    checkDomainFn: async (domain) => ({
      domain,
      status: "AVAILABLE",
    }),
  });

  assert.ok(summary.checked < summary.candidatePool);
  assert.equal(summary.search_truncated, true);
  assert.equal(summary.remaining_candidates, summary.candidatePool - summary.checked);
  assert.equal(summary.max_checks_applied, summary.candidatePool);
});

test("checkCandidates caps repeated creative TLDs when alternatives exist", async () => {
  const summary = await checkCandidates({
    mode: "hack",
    limit: 4,
    progressFormat: "silent",
    candidates: [
      { mode: "hack", domain: "saloni.st", label: "saloni", tld: "st", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 90 },
      { mode: "hack", domain: "colo.st", label: "colo", tld: "st", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 89 },
      { mode: "hack", domain: "mane.st", label: "mane", tld: "st", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 88 },
      { mode: "hack", domain: "poli.sh", label: "poli", tld: "sh", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 87 },
      { mode: "hack", domain: "shear.it", label: "shear", tld: "it", domain_shape: "creative_suffix", source_type: "provided", candidate_type: "brandable", score: 86 },
    ],
    checkDomainFn: async () => ({ status: "AVAILABLE" }),
  });
  const tldCounts = summary.results.reduce((counts, item) => {
    counts[item.tld] = (counts[item.tld] || 0) + 1;
    return counts;
  }, {});

  assert.ok((tldCounts.st || 0) <= 2);
  assert.ok(summary.results.some((item) => item.tld === "sh"));
  assert.ok(summary.results.some((item) => item.tld === "it"));
});

test("generateCandidates rejects brandable mode without explicit input", () => {
  assert.throws(
    () => generateCandidates({ mode: "brandable" }),
    /Brandable mode requires explicit source words/,
  );
});

test("generateCandidates rejects oversized brandable source lists", () => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const words = Array.from({ length: 201 }, (_, index) => (
    `w${letters[Math.floor(index / 26) % 26]}${letters[index % 26]}d`
  ));

  assert.throws(
    () => generateCandidates({ mode: "brandable", words }),
    /at most 200 explicit source words/,
  );
});

test("searchDomains supports explicit brandable mode", async () => {
  const summary = await searchDomains({
    mode: "brandable",
    words: ["chicago", "salon", "gloss", "shear"],
    limit: 3,
    progressFormat: "silent",
    checkDomainFn: async (domain) => ({
      domain,
      status: "AVAILABLE",
    }),
  });

  assert.equal(summary.mode, "brandable");
  assert.ok(summary.results.length > 0);
  assert.ok(summary.results.every((item) => item.tld === "com"));
  assert.ok(summary.results.every((item) => item.candidate_type === "brandable"));
  assert.equal(typeof summary.search_truncated, "boolean");
  assert.equal(typeof summary.max_checks_applied, "number");
});

test("searchDomains keeps readable .it candidates while dropping weak ones", async () => {
  const summary = await searchDomains({
    mode: "hack",
    tlds: ["it"],
    words: ["shearit", "setcrafit", "brushit"],
    limit: 5,
    progressFormat: "silent",
    checkDomainFn: async (domain) => ({
      domain,
      status: "AVAILABLE",
    }),
  });

  assert.ok(summary.results.some((item) => item.domain === "shear.it"));
  assert.ok(summary.results.some((item) => item.domain === "brush.it"));
  assert.ok(!summary.results.some((item) => item.domain === "setcraf.it"));
});

test("getTldPricing can return explicit unknown TLD placeholders", () => {
  const pricing = getTldPricing({ tlds: ["madeup"] });
  assert.equal(pricing.items[0].tld, "madeup");
  assert.equal(pricing.items[0].annual_price_usd, null);
  assert.deepEqual(pricing.items[0].registration_options, []);
});

test("getTldPricing exposes broader hack-friendly price coverage under a max price", () => {
  const pricing = getTldPricing({ maxPrice: 30 });
  const tlds = new Set(pricing.items.map((item) => item.tld));

  assert.ok(tlds.has("sh"));
  assert.ok(tlds.has("in"));
  assert.ok(tlds.has("me"));
});

test(".st uses a curated non-Namecheap registration target", () => {
  const pricing = getTldPricing({ tlds: ["st"] });
  const option = pricing.items[0].registration_options[0];

  assert.equal(option.provider, "ST Registry");
  assert.equal(option.kind, "registry_homepage");
  assert.match(option.url, /nic\.st/);
});
