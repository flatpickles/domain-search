const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "domain-search.js");
const skillScriptPath = path.join(repoRoot, "skill", "scripts", "domain-search.sh");
const fixtureWords = path.join(__dirname, "fixtures", "words-small.txt");
const fakeBinDir = path.join(__dirname, "fixtures");

function runCli(args, options = {}) {
  return execFileSync("node", [cliPath, ...args], {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH}`,
    },
  });
}

test("generate emits candidate JSON without WHOIS status", () => {
  const output = runCli([
    "generate",
    "--mode",
    "hack",
    "--tlds",
    "se,st",
    "--words-file",
    fixtureWords,
    "--limit",
    "2",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "generate");
  assert.equal(parsed.mode, "hack");
  assert.equal(parsed.candidates.length, 2);
  assert.equal(parsed.candidates[0].status, undefined);
});

test("check supports JSON handoff from generate output", () => {
  const shellOutput = execFileSync(
    "zsh",
    [
      "-lc",
      `export PATH="${fakeBinDir}:$PATH"; node "${cliPath}" generate --mode hack --tlds se,st --words-file "${fixtureWords}" --limit 2 | node "${cliPath}" check --input - --progress-format silent`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  const parsed = JSON.parse(shellOutput);

  assert.equal(parsed.kind, "check");
  assert.equal(parsed.available, 2);
  assert.equal(parsed.results.length, 2);
  assert.ok(parsed.results.every((item) => item.registration_provider));
});

test("search runs generate plus check with exact mode", () => {
  const output = runCli([
    "search",
    "--mode",
    "exact",
    "--tlds",
    "com,net",
    "--words-file",
    fixtureWords,
    "--limit",
    "2",
    "--progress-format",
    "silent",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "search");
  assert.equal(parsed.mode, "exact");
  assert.equal(parsed.results.length, 2);
  assert.ok(parsed.results.every((item) => ["com", "net"].includes(item.tld)));
});

test("check can surface UNKNOWN results when requested", () => {
  const output = runCli([
    "check",
    "unknown.test",
    "--show-unknown",
    "--progress-format",
    "silent",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.unknown, 1);
  assert.equal(parsed.results[0].status, "UNKNOWN");
});

test("check accepts plain text domain lists from stdin", () => {
  const output = execFileSync(
    "zsh",
    [
      "-lc",
      `export PATH="${fakeBinDir}:$PATH"; printf "walk.in\\nleashr.me\\n" | node "${cliPath}" check --input - --progress-format silent`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "check");
  assert.equal(parsed.results.length, 2);
  assert.deepEqual(
    parsed.results.map((item) => item.domain),
    ["walk.in", "leashr.me"],
  );
});

test("prices filters bundled metadata by max price", () => {
  const output = runCli([
    "prices",
    "--max-price",
    "20",
  ]);
  const parsed = JSON.parse(output);

  assert.ok(parsed.items.some((item) => item.tld === "com"));
  assert.ok(parsed.items.every((item) => item.annual_price_usd === null || item.annual_price_usd <= 20));
});

test("skill launcher works from the skill directory", () => {
  const output = execFileSync(
    skillScriptPath,
    [
      "generate",
      "--mode",
      "hack",
      "--tlds",
      "se,st",
      "--words-file",
      fixtureWords,
      "--limit",
      "1",
    ],
    {
      cwd: path.join(repoRoot, "skill"),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH}`,
      },
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "generate");
  assert.equal(parsed.candidates.length, 1);
});
