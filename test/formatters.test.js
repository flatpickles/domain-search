const test = require("node:test");
const assert = require("node:assert/strict");
const { formatResults } = require("../lib/formatters");

const summary = {
  mode: "hack",
  tlds: ["st", "it"],
  checked: 4,
  candidatePool: 10,
  available: 2,
  results: [
    {
      word: "chemist",
      domain: "chemi.st",
      definition: "A scientist or expert in chemistry.",
      definitionSource: "https://en.wiktionary.org/wiki/chemist",
    },
  ],
};

test("formatResults emits markdown by default", () => {
  const output = formatResults(summary);
  assert.match(output, /# Available Domain Hacks/);
  assert.match(output, /chemi\.st/);
});

test("formatResults emits json when requested", () => {
  const output = formatResults(summary, { format: "json" });
  const parsed = JSON.parse(output);
  assert.equal(parsed.mode, "hack");
  assert.equal(parsed.results[0].domain, "chemi.st");
});
