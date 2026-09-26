#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  checkCandidates,
  checkDomain,
  formatResults,
  generateCandidates,
  getTldPricing,
  searchDomains,
} = require("..");
const { doctor } = require("../lib/doctor");
const { runWithSession } = require("../lib/sessions");
const { normalizeWords } = require("../lib/words");
const { normalizeDomain } = require("../lib/whois");

function usage() {
  const script = path.basename(process.argv[1]);
  return [
    `Usage: ${script} <generate|check|search|prices> [options]`,
    "",
    "Commands:",
    "  generate  Generate ranked traditional .com and whole-word domain hack candidates",
    "  check     Check a shortlist, JSON input, or direct domains/names",
    "  search    Convenience wrapper for generate + check",
    "  doctor    Check runtime/data; --network also probes HTTPS",
    "  prices    Show bundled TLD pricing and registrar metadata",
    "",
    "Shared options:",
    "  --mode <mixed|hack|exact|brandable> Choose .com + hacks, hacks, exact TLDs, or brandable .com",
    "  --tlds <list>                Comma-separated TLDs",
    "  --tld-length <n>             Use delegated ASCII TLDs with exactly n letters",
    "  --limit <n>                  Result limit",
    "  --max-checks <n>             Maximum domain checks (including RDAP fallback)",
    "  --max-price <n>              Use bundled TLD prices to limit selected TLDs",
    "  --all                        Use every delegated IANA root-zone TLD",
    "  --format <json|markdown>     Output format",
    "  --output <path>              Write stdout payload to a file",
    "",
    "Input options:",
    "  --words-file <path|- >       Read newline words from a file or stdin",
    "  --sources-file <path>       JSON words with kind, rationale, priority, and theme",
    "  --preferences-file <path>   JSON liked/rejected names and avoided fragments",
    "  --min-commonness <0..1>     Filter explicit source commonness ratings",
    "  --input <path|- >            Read candidate JSON from a file or stdin",
    "",
    "Check/search options:",
    "  --verification <auto|rdap|whois-first>  Auto tries RDAP first; rdap needs no WHOIS binary",
    "  --concurrency <n>            Concurrent WHOIS checks",
    "  --with-descriptions          Fetch one short description for real-word results",
    "  --show-unknown               Include UNKNOWN WHOIS results",
    "  --show-all                   Include registered and unknown domains in results",
    "  --progress-format <human|jsonl|silent>",
    "",
    "Sessions (search/check):",
    "  --session <file>            Save a new portable session; checkpoint every lookup",
    "  --resume <file>             Continue the frozen pool, skipping fresh checks",
    "  --exclude-checked <file>    Skip fresh checks from another session/result",
    "  --freshness-hours <n>       Override status TTLs; 0 rechecks everything",
    "",
    "Eligibility (partial reviewed coverage):",
    "  --profile <file>            JSON country/entity profile",
    "  --policies <file>           Reviewed policy overrides with provenance",
    "  --eligible-only            Generate only names passing known profile rules",
    "",
    "Word filtering:",
    "  --min-word-length <n>",
    "  --max-word-length <n>",
    "  --min-label-length <n>",
    "  --max-domain-length <n>",
    "",
    "Legacy aliases:",
    `  ${script} hack ...       => ${script} search --mode hack ...`,
    `  ${script} exact ...      => ${script} search --mode exact ...`,
    `  ${script} brandable ...  => ${script} search --mode brandable ...`,
    "",
    "Default behavior:",
    "  Without --mode, --tlds, --tld-length, or --all, generate/search uses .com plus whole-word hacks; --max-price only filters that scope.",
    "  Supplied source words include short names; dictionary defaults use 5-10 letters.",
    "  check --limit trims displayed results; --max-checks limits network work. JSON checks records every lookup.",
    "  Search now applies bounded progressive checking by default and may return partial results with search_truncated=true.",
  ].join("\n");
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const booleanFlags = new Set([
    "all", "eligible-only", "network",
    "help",
    "show-unknown",
    "show-all",
    "with-definitions",
    "with-descriptions",
  ]);
  const valueFlags = new Set([
    "mode", "tlds", "tld-length", "limit", "max-checks", "max-price", "format", "output",
    "words-file", "input", "concurrency", "progress-format", "min-word-length",
    "max-word-length", "min-label-length", "max-domain-length",
    "session", "resume", "exclude-checked", "freshness-hours",
    "sources-file", "preferences-file", "min-commonness", "verification", "profile", "policies",
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const equals = token.indexOf("=");
    const key = equals < 0 ? token : token.slice(0, equals);
    const inlineValue = equals < 0 ? undefined : token.slice(equals + 1);
    const normalizedKey = key.slice(2);
    if (!booleanFlags.has(normalizedKey) && !valueFlags.has(normalizedKey)) {
      throw new Error(`Unknown option: ${key}`);
    }

    if (inlineValue !== undefined) {
      if (!inlineValue || booleanFlags.has(normalizedKey)) throw new Error(`Invalid value for ${key}`);
      flags[normalizedKey] = inlineValue;
      continue;
    }

    if (booleanFlags.has(normalizedKey)) {
      flags[normalizedKey] = true;
      continue;
    }

    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    flags[normalizedKey] = value;
    i += 1;
  }
  for (const [key, values] of Object.entries({
    verification: ["auto", "rdap", "whois-first"],
    mode: ["mixed", "exact", "hack", "brandable"],
    format: ["json", "markdown"],
    "progress-format": ["human", "jsonl", "silent"],
  })) {
    if (flags[key] !== undefined && !values.includes(flags[key])) {
      throw new Error(`--${key} must be one of: ${values.join(", ")}`);
    }
  }

  return {
    command: positional[0],
    args: positional.slice(1),
    flags,
  };
}

function readTextInput(inputPath) {
  return inputPath === "-"
    ? fs.readFileSync(0, "utf8")
    : fs.readFileSync(inputPath, "utf8");
}

function parseCandidateInput(inputPath) {
  const raw = readTextInput(inputPath);
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.candidates)) return parsed.candidates;
    if (Array.isArray(parsed.results)) return parsed.results;

    throw new Error("Expected a JSON array or an object with `candidates` or `results`.");
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
}

function toGenerateOptions(flags, options = {}) {
  return {
    profileFile: flags.profile,
    policiesFile: flags.policies,
    eligibleOnly: Boolean(flags["eligible-only"]),
    mode: flags.mode,
    tlds: flags.tlds,
    tldLength: flags["tld-length"],
    wordsFile: flags["words-file"],
    sourcesFile: flags["sources-file"],
    preferencesFile: flags["preferences-file"],
    minCommonness: flags["min-commonness"],
    minWordLength: flags["min-word-length"],
    maxWordLength: flags["max-word-length"],
    minLabelLength: flags["min-label-length"],
    maxDomainLength: flags["max-domain-length"],
    emitLimit: options.includeEmitLimit ? flags.limit : undefined,
    maxPrice: flags["max-price"],
    all: Boolean(flags.all),
  };
}

function toCheckOptions(flags) {
  return {
    profileFile: flags.profile,
    policiesFile: flags.policies,
    eligibleOnly: Boolean(flags["eligible-only"]),
    mode: flags.mode,
    tlds: flags.tlds,
    limit: flags.limit,
    concurrency: flags.concurrency,
    verification: flags.verification || (process.env.DOMAIN_SEARCH_WHOIS_BIN ? "whois-first" : "auto"),
    maxChecks: flags["max-checks"],
    showUnknown: Boolean(flags["show-unknown"]),
    showAll: Boolean(flags["show-all"]),
    withDefinitions: Boolean(flags["with-definitions"]),
    withDescriptions: Boolean(flags["with-descriptions"] || flags["with-definitions"]),
    progressFormat: flags["progress-format"] || "human",
  };
}

function createCandidatesFromArgs(args, flags) {
  const explicitDomains = args.filter((value) => value.includes("."));
  const bareInputs = args.filter((value) => !explicitDomains.includes(value));
  const candidates = explicitDomains.map((domain) => ({
    ...(flags.mode ? { mode: flags.mode } : {}),
    input: domain,
    domain: normalizeDomain(domain),
    source_type: "provided",
    candidate_type: "brandable",
    description: null,
    description_source: "none",
  }));

  if (bareInputs.length === 0) {
    return candidates;
  }
  const words = normalizeWords(bareInputs, {
    minWordLength: flags["min-word-length"] ?? 1,
    maxWordLength: flags["max-word-length"] ?? 64,
  });
  const generated = generateCandidates({
    profileFile: flags.profile,
    policiesFile: flags.policies,
    eligibleOnly: Boolean(flags["eligible-only"]),
    mode: flags.mode,
    tlds: flags.tlds,
    tldLength: flags["tld-length"],
    words,
    minWordLength: flags["min-word-length"],
    maxWordLength: flags["max-word-length"],
    minLabelLength: flags["min-label-length"],
    maxDomainLength: flags["max-domain-length"],
    maxPrice: flags["max-price"],
    all: Boolean(flags.all),
  });

  return [
    ...candidates,
    ...generated.candidates.map((candidate) => ({
      ...candidate,
      input: candidate.word,
      source_type: "wordlist",
      candidate_type: "brandable",
      description: null,
      description_source: "none",
    })),
  ];
}

function writeOutput(output, flags) {
  if (flags.output) {
    fs.writeFileSync(flags.output, output);
    return;
  }

  process.stdout.write(output);
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));
  let { command } = parsed;
  const { args, flags } = parsed;

  if (command === "hack" || command === "exact" || command === "brandable") {
    flags.mode = command;
    command = "search";
  }

  if (flags.help || !command) {
    process.stdout.write(`${usage()}\n`);
    process.exit(flags.help || command ? 0 : 1);
  }
  if (command !== "check" && command !== "check-domain" && args.length) {
    throw new Error(`${command} does not accept positional inputs; use --words-file or check.`);
  }
  if (command === "check" && flags.input && args.length) {
    throw new Error("Use either --input or positional domains, not both.");
  }

  const sessionPaths = { session: flags.session, resume: flags.resume, excludeChecked: flags["exclude-checked"], freshnessHours: flags["freshness-hours"] };
  if (flags.resume && (args.length || flags.input || flags["words-file"] || flags["sources-file"] || flags["preferences-file"] || flags["min-commonness"] || flags.mode || flags.tlds || flags.all || flags["tld-length"])) {
    throw new Error("Resume uses the saved candidate pool; start a new session to change inputs or scope.");
  }
  if (command === "doctor") {
    writeOutput(`${JSON.stringify(await doctor({ network: Boolean(flags.network) }), null, 2)}\n`, flags);
    return;
  }
  if (command === "prices") {
    const summary = getTldPricing({
      tlds: flags.tlds,
      tldLength: flags["tld-length"],
      maxPrice: flags["max-price"],
      all: Boolean(flags.all),
    });
    writeOutput(formatResults(summary, { format: flags.format || "json" }), flags);
    return;
  }

  if (command === "generate") {
    const summary = generateCandidates(toGenerateOptions(flags, { includeEmitLimit: true }));
    writeOutput(formatResults(summary, { format: flags.format || "json" }), flags);
    return;
  }

  if (command === "check") {
    let candidates = [];

    if (flags.input) {
      candidates = parseCandidateInput(flags.input);
    } else if (args.length > 0) {
      candidates = createCandidatesFromArgs(args, flags);
    } else if (!flags.resume) {
      throw new Error("The check command requires `--input` or one or more domains/words.");
    }

    const summary = await runWithSession("check", {
      ...toCheckOptions(flags),
      candidates,
    }, sessionPaths);
    writeOutput(formatResults(summary, { format: flags.format || "json" }), flags);
    return;
  }

  if (command === "search") {
    const summary = await runWithSession("search", {
      ...toGenerateOptions(flags),
      ...toCheckOptions(flags),
    }, sessionPaths);
    writeOutput(formatResults(summary, { format: flags.format || "json" }), flags);
    return;
  }

  if (command === "check-domain") {
    if (args.length === 0) {
      throw new Error("The check-domain command requires one or more domains.");
    }
    for (const input of args) {
      const result = await checkDomain(input, toCheckOptions(flags));
      process.stdout.write(`${result.status}\t${result.domain}\n`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
