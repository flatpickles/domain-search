const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateBrandableCandidates,
  generateHackCandidates,
  generateExactCandidates,
  scoreBrandable,
} = require("../lib/candidates");

test("generateHackCandidates builds hack domains from requested TLDs", () => {
  const results = generateHackCandidates(
    ["chemist", "appraise", "plainword"],
    {
      tlds: ["se", "st"],
      minLabelLength: 3,
      maxDomainLength: 10,
    },
  );

  assert.ok(results.some((item) => item.domain === "apprai.se"));
  assert.ok(results.some((item) => item.domain === "chemi.st"));
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
    ["salonist", "shearit", "polish", "coifit", "curlit", "brushit"],
    {
      tlds: ["st", "it", "sh"],
      minLabelLength: 3,
      maxDomainLength: 10,
    },
  );

  assert.deepEqual(
    results.slice(0, 3).map((item) => item.tld),
    ["st", "sh", "it"],
  );
});

test("generateBrandableCandidates builds short .com labels from explicit source words", () => {
  const results = generateBrandableCandidates(["chicago", "salon", "gloss", "shear"]);

  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.tld === "com"));
  assert.ok(results.every((item) => item.label.length >= 6 && item.label.length <= 10));
});
