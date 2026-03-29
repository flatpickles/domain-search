const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateHackCandidates,
  generateExactCandidates,
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
