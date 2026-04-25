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

  assert.match(output, /# Generated Creative Suffix Candidates/);
  assert.match(output, /chemi\.st/);
});

test("formatResults emits brandable generate headings", () => {
  const output = formatResults({
    kind: "generate",
    mode: "brandable",
    tlds: ["com"],
    candidatePool: 4,
    emitted: 2,
    candidates: [
      {
        word: "saloise",
        domain: "saloise.com",
        score: 48,
      },
    ],
  });

  assert.match(output, /# Generated Brandable \.com Candidates/);
  assert.match(output, /saloise\.com/);
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
        description: "A scientist or expert in chemistry.",
        description_source: "wiktionary",
        description_url: "https://en.wiktionary.org/wiki/chemist",
        candidate_type: "real_word",
        registration_provider: "Namecheap",
        registration_kind: "registrar_search",
        registration_url: "https://example.test",
        price: 18.48,
      },
    ],
  });

  assert.match(output, /Register via \[Namecheap\]/);
  assert.match(output, /Renewal: \$18.48/);
  assert.match(output, /A scientist or expert in chemistry/);
});

test("formatResults groups mixed real-word and brandable results", () => {
  const output = formatResults({
    kind: "check",
    mode: "hack",
    tlds: ["in", "me"],
    checked: 2,
    candidatePool: 2,
    available: 2,
    unknown: 0,
    results: [
      {
        word: "walkin",
        input: "walkin",
        domain: "walk.in",
        description: "To move at a regular pace by lifting and setting down each foot in turn.",
        description_source: "dictionaryapi",
        candidate_type: "real_word",
      },
      {
        input: "leashr",
        label: "leashr",
        domain: "leashr.me",
        description: "Friendly dog-walking brand.",
        description_source: "agent",
        candidate_type: "brandable",
      },
    ],
  });

  assert.match(output, /Best Real-Word \/ Natural Hits/);
  assert.match(output, /Best Brandable \/ Coined Hits/);
  assert.match(output, /Friendly dog-walking brand/);
});

test("formatResults groups mixed-mode results by domain shape", () => {
  const output = formatResults({
    kind: "check",
    mode: "mixed",
    tlds: ["com", "st"],
    checked: 2,
    candidatePool: 2,
    available: 2,
    unknown: 0,
    selection_policy: "soft_shape_balance",
    selected_counts: { exact: 1, creative_suffix: 1 },
    results: [
      {
        word: "sunrise",
        input: "sunrise",
        domain: "sunrise.com",
        domain_shape: "exact",
        candidate_type: "real_word",
      },
      {
        word: "chemist",
        input: "chemist",
        domain: "chemi.st",
        domain_shape: "creative_suffix",
        candidate_type: "real_word",
      },
    ],
  });

  assert.match(output, /Best \.com \/ Exact Hits/);
  assert.match(output, /Best Creative Suffix \/ Domain Hack Hits/);
  assert.match(output, /Selected with soft shape balance: 1 exact and 1 creative suffix results/);
});

test("formatResults separates unknown results needing registrar verification", () => {
  const output = formatResults({
    kind: "check",
    mode: "hack",
    tlds: ["in"],
    checked: 2,
    candidatePool: 2,
    available: 1,
    unknown: 1,
    results: [
      {
        word: "walk",
        input: "walk",
        domain: "walk.in",
        description: "Direct and memorable service name.",
        candidate_type: "real_word",
        verification_status: "available",
      },
      {
        input: "romp",
        label: "romp",
        domain: "romp.in",
        description: "Playful motion.",
        candidate_type: "brandable",
        verification_status: "unknown_needs_registrar_check",
        verification_hint: "WHOIS inconclusive; verify on registrar before recommending purchase.",
        registration_provider: "Namecheap",
        registration_kind: "registrar_search",
        registration_url: "https://example.test",
      },
    ],
  });

  assert.match(output, /## Available Results/);
  assert.match(output, /## Unknown Results Needing Registrar Verification/);
  assert.match(output, /WHOIS inconclusive; verify on registrar before recommending purchase/);
  assert.match(output, /Register via \[Namecheap\]/);
});

test("formatResults separates registered results from available results", () => {
  const output = formatResults({
    kind: "check",
    mode: "exact",
    tlds: ["com"],
    checked: 2,
    candidatePool: 2,
    available: 1,
    unknown: 0,
    registered: 1,
    results: [
      {
        word: "sunrise",
        domain: "sunrise.com",
        candidate_type: "real_word",
        verification_status: "available",
      },
      {
        word: "taken",
        domain: "taken.com",
        candidate_type: "real_word",
        verification_status: "registered",
        verification_hint: "Already registered.",
      },
    ],
  });

  assert.match(output, /## Available Results/);
  assert.match(output, /## Registered Results/);
  assert.match(output, /Already registered/);
  assert.ok(output.indexOf("## Registered Results") > output.indexOf("sunrise.com"));
});

test("formatResults distinguishes registry fallback links", () => {
  const output = formatResults({
    kind: "check",
    mode: "hack",
    tlds: ["st"],
    checked: 1,
    candidatePool: 1,
    available: 1,
    unknown: 0,
    results: [
      {
        word: "chemist",
        domain: "chemi.st",
        description: "A scientist or expert in chemistry.",
        candidate_type: "real_word",
        registration_provider: "ST Registry",
        registration_kind: "registry_homepage",
        registration_url: "https://en.nic.st/",
        registration_note: "No verified registrar search link is bundled for this TLD; using the official registry homepage.",
      },
    ],
  });

  assert.match(output, /Official registry: \[ST Registry\]/);
  assert.match(output, /official registry homepage/);
});

test("formatResults emits json when requested", () => {
  const output = formatResults({
    kind: "prices",
    items: [{ tld: "com", annual_price_usd: 18.48 }],
  }, { format: "json" });
  const parsed = JSON.parse(output);
  assert.equal(parsed.items[0].tld, "com");
});

test("formatResults includes bounded search metadata for search summaries", () => {
  const output = formatResults({
    kind: "search",
    mode: "brandable",
    tlds: ["com"],
    checked: 4,
    candidatePool: 20,
    available: 3,
    unknown: 0,
    search_truncated: true,
    remaining_candidates: 16,
    max_checks_applied: 20,
    results: [
      {
        input: "saloise",
        label: "saloise",
        domain: "saloise.com",
        candidate_type: "brandable",
      },
    ],
  });

  assert.match(output, /Search truncated: yes/);
  assert.match(output, /max search budget of 20/);
  assert.match(output, /16 ranked candidates remain unchecked/);
});
