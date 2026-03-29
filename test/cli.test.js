const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "domain-search.js");
const skillScriptPath = path.join(repoRoot, "skill", "scripts", "domain-search.sh");
const skillShortlistExample = path.join(repoRoot, "skill", "examples", "brandable-shortlist.json");
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

test("generate defaults to mixed mode when no mode or tlds are provided", () => {
  const output = runCli([
    "generate",
    "--words-file",
    fixtureWords,
    "--limit",
    "10",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.mode, "mixed");
  assert.ok(parsed.candidates.some((item) => item.domain_shape === "exact"));
  assert.ok(parsed.candidates.some((item) => item.domain_shape === "creative_suffix"));
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
  assert.ok(parsed.results.every((item) => item.registration_kind));
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
  assert.equal(parsed.results[0].verification_status, "unknown_needs_registrar_check");
  assert.match(parsed.results[0].verification_hint, /WHOIS inconclusive/);
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

test("check expands bare inputs with the mixed default when mode and tlds are omitted", () => {
  const output = runCli([
    "check",
    "chemist",
    "appraise",
    "--show-unknown",
    "--progress-format",
    "silent",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "check");
  assert.ok(parsed.results.some((item) => item.domain === "chemist.com"));
  assert.ok(parsed.results.some((item) => item.domain === "chemi.st"));
  assert.ok(parsed.results.some((item) => item.domain_shape === "exact"));
  assert.ok(parsed.results.some((item) => item.domain_shape === "creative_suffix"));
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

test("check uses curated .st registration metadata instead of Namecheap fallback", () => {
  const output = runCli([
    "check",
    "chemi.st",
    "--progress-format",
    "silent",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.results[0].registration_provider, "ST Registry");
  assert.equal(parsed.results[0].registration_kind, "registry_homepage");
  assert.match(parsed.results[0].registration_url, /nic\.st/);
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

test("skill shortlist example is valid JSON and works with check --input", () => {
  const example = JSON.parse(fs.readFileSync(skillShortlistExample, "utf8"));
  assert.ok(Array.isArray(example));
  assert.ok(example[0].domain);

  const output = execFileSync(
    skillScriptPath,
    [
      "check",
      "--input",
      skillShortlistExample,
      "--show-unknown",
      "--progress-format",
      "silent",
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

  assert.equal(parsed.kind, "check");
  assert.ok(parsed.results.length >= 1);
});
