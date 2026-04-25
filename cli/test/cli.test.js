const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const cliRoot = path.join(__dirname, "..");
const skillRoot = path.join(cliRoot, "..");
const cliPath = path.join(cliRoot, "bin", "domain-search.js");
const skillScriptPath = path.join(skillRoot, "domain-search.sh");
const fixtureWords = path.join(__dirname, "fixtures", "words-small.txt");
const fakeBinDir = path.join(__dirname, "fixtures");

function runCli(args, options = {}) {
  return execFileSync("node", [cliPath, ...args], {
    cwd: options.cwd || cliRoot,
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
      cwd: cliRoot,
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

test("search supports explicit brandable mode and exposes bounded-search metadata", () => {
  const output = runCli([
    "search",
    "--mode",
    "brandable",
    "--words-file",
    fixtureWords,
    "--limit",
    "2",
    "--progress-format",
    "silent",
  ]);
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "search");
  assert.equal(parsed.mode, "brandable");
  assert.ok(parsed.results.length > 0);
  assert.ok(parsed.results.every((item) => item.tld === "com"));
  assert.equal(typeof parsed.search_truncated, "boolean");
  assert.equal(typeof parsed.remaining_candidates, "number");
  assert.equal(typeof parsed.max_checks_applied, "number");
});

test("check rejects non-root-zone TLDs", () => {
  assert.throws(
    () =>
      runCli([
        "check",
        "unknown.test",
        "--progress-format",
        "silent",
      ]),
    /Unknown or unsupported TLDs in candidate checking: \.test\./,
  );
});

test("check accepts plain text domain lists from stdin", () => {
  const output = execFileSync(
    "zsh",
    [
      "-lc",
      `export PATH="${fakeBinDir}:$PATH"; printf "walk.in\\nleashr.me\\n" | node "${cliPath}" check --input - --progress-format silent`,
    ],
    {
      cwd: cliRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "check");
  assert.equal(parsed.results.length, 2);
  assert.deepEqual(
    new Set(parsed.results.map((item) => item.domain)),
    new Set(["walk.in", "leashr.me"]),
  );
  const byDomain = new Map(parsed.results.map((item) => [item.domain, item]));
  assert.equal(byDomain.get("walk.in").domain_shape, "creative_suffix");
  assert.equal(byDomain.get("leashr.me").domain_shape, "exact");
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

test("check filters weak provided domains from direct CLI args", () => {
  const output = runCli([
    "check",
    "stageforgeco.com",
    "walk.in",
    "steady.st",
    "--progress-format",
    "silent",
  ]);
  const parsed = JSON.parse(output);

  assert.deepEqual(
    parsed.results.map((item) => item.domain),
    ["steady.st", "walk.in"],
  );
  assert.equal(parsed.results[0].domain_shape, "exact");
  assert.equal(parsed.results[1].domain_shape, "creative_suffix");
});

test("skill launcher works from the skill root", () => {
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
      cwd: skillRoot,
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

test("skill launcher checks structured shortlist JSON from stdin", () => {
  const shortlist = JSON.stringify([
    {
      domain: "leashr.me",
      label: "leashr",
      word: "leashr",
      candidate_type: "brandable",
      source_type: "provided",
      description: "Friendly dog-walking brand.",
      description_source: "agent",
      score: 31,
    },
    {
      domain: "walk.in",
      label: "walk",
      word: "walk",
      candidate_type: "real_word",
      source_type: "provided",
      description: "Direct, memorable service name.",
      description_source: "user",
      score: 42,
    },
  ]);

  const output = execFileSync(
    skillScriptPath,
    [
      "check",
      "--input",
      "-",
      "--show-unknown",
      "--progress-format",
      "silent",
    ],
    {
      cwd: skillRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH}`,
      },
      input: shortlist,
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.kind, "check");
  assert.ok(parsed.results.length >= 1);
});
