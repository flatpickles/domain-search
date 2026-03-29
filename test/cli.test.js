const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "domain-search.js");
const fixtureWords = path.join(__dirname, "fixtures", "words-small.txt");
const fakeBinDir = path.join(__dirname, "fixtures");

function runCli(args) {
  return execFileSync("node", [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      DOMAIN_SEARCH_DISABLE_DEFINITIONS: "1",
    },
  });
}

test("hack command supports offline smoke testing with a fake whois binary", () => {
  const output = runCli([
    "hack",
    "--tlds",
    "se,st",
    "--words-file",
    fixtureWords,
    "--limit",
    "2",
    "--format",
    "json",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.mode, "hack");
  assert.equal(parsed.results.length, 2);
  assert.ok(parsed.results.every((item) => item.status === "AVAILABLE"));
  assert.ok(parsed.results.some((item) => item.domain.endsWith(".st") || item.domain.endsWith(".se")));
});

test("check command normalizes domains and prints statuses", () => {
  const output = runCli(["check", "https://example.com/path"]);
  assert.match(output, /^AVAILABLE\texample\.com$/m);
});

test("exact command supports offline smoke testing with multiple TLDs", () => {
  const output = runCli([
    "exact",
    "--tlds",
    "com,net",
    "--words-file",
    fixtureWords,
    "--limit",
    "2",
    "--format",
    "json",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.mode, "exact");
  assert.equal(parsed.results.length, 2);
  assert.ok(parsed.results.every((item) => ["com", "net"].includes(item.tld)));
});
