const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateBrandableCandidates,
  generateHackCandidates,
  generateExactCandidates,
  hasBlockedCorporateTail,
  scoreBrandable,
} = require("../lib/candidates");

test("generateHackCandidates builds hack domains from requested TLDs", () => {
  const results = generateHackCandidates(
    ["chemist", "appraise", "trucking", "plainword"],
    {
      tlds: ["se", "st", "in"],
      minLabelLength: 3,
      maxDomainLength: 10,
    },
  );

  assert.ok(results.some((item) => item.domain === "apprai.se"));
  assert.ok(results.some((item) => item.domain === "chemi.st"));
  assert.ok(results.some((item) => item.domain === "truck.in"));
});

test("generateExactCandidates expands words across multiple TLDs", () => {
  const results = generateExactCandidates(["sunrise"], {
    tlds: ["com", "net"],
  });

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((item) => item.domain).sort(),
    ["sunrise.com", "sunrise.net"],
  );
});

test("generic prefixes and awkward clusters are de-boosted", () => {
  const plain = generateExactCandidates(["sunrise"], { tlds: ["com"] })[0];
  const prefixed = generateExactCandidates(["pseudosunrise"], { tlds: ["com"] })[0];

  assert.ok(plain.score > prefixed.score);
});

test("brandable scoring de-boosts awkward doubled endings", () => {
  assert.ok(scoreBrandable("walkr") > scoreBrandable("walkrr"));
  assert.ok(scoreBrandable("leashly") > scoreBrandable("leashrr"));
});

test("generateHackCandidates diversifies early results across TLDs", () => {
  const results = generateHackCandidates(
    ["salonist", "polish", "appraise", "trucking"],
    {
      tlds: ["st", "se", "sh", "in"],
      minLabelLength: 3,
      maxDomainLength: 10,
    },
  );

  assert.deepEqual(
    results.slice(0, 3).map((item) => item.tld),
    ["se", "sh", "in"],
  );
});

test("generateBrandableCandidates builds short .com labels from explicit source words", () => {
  const results = generateBrandableCandidates(["chicago", "salon", "gloss", "shear"]);

  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.tld === "com"));
  assert.ok(results.every((item) => item.label.length >= 6 && item.label.length <= 10));
});

test("generateBrandableCandidates excludes corporate filler source words and tails", () => {
  const results = generateBrandableCandidates(["company", "stage", "scene", "build"]);

  assert.ok(results.length > 0);
  assert.ok(results.every((item) => !item.source_words.includes("company")));
  assert.ok(results.every((item) => !hasBlockedCorporateTail(item.label)));
});

test("generateExactCandidates filters labels ending in corporate filler tails", () => {
  const results = generateExactCandidates(["stageco", "sunrise"], { tlds: ["com"] });

  assert.ok(!results.some((item) => item.domain === "stageco.com"));
  assert.ok(results.some((item) => item.domain === "sunrise.com"));
});

test("generateHackCandidates keeps only whole-word hack joins", () => {
  const results = generateHackCandidates(
    ["trucking", "walking", "steadyst", "stagecore"],
    {
      tlds: ["in", "re", "st"],
      minLabelLength: 3,
      maxDomainLength: 12,
    },
  );

  assert.ok(results.some((item) => item.domain === "truck.in"));
  assert.ok(results.some((item) => item.domain === "walk.in"));
  assert.ok(!results.some((item) => item.domain === "stageco.re"));
  assert.ok(!results.some((item) => item.domain === "steady.st"));
});

test("generateHackCandidates validates whole-word hacks against explicit source words", () => {
  const results = generateHackCandidates(["novalyst"], {
    tlds: ["st"],
    minLabelLength: 3,
    maxDomainLength: 20,
    scoreThreshold: -999,
    sourceWordSet: new Set(["novalyst"]),
  });

  assert.ok(results.some((item) => item.domain === "novaly.st"));
});
