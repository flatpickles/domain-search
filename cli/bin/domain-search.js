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
    "  prices    Show bundled TLD pricing and registrar metadata",
    "",
    "Shared options:",
    "  --mode <hack|exact|brandable> Force domain hack, traditional exact, or brandable .com domains",
    "  --tlds <list>                Comma-separated TLDs",
    "  --limit <n>                  Result limit",
    "  --max-checks <n>             Maximum WHOIS checks",
    "  --max-price <n>              Use bundled TLD prices to limit selected TLDs",
    "  --all                        Use every delegated IANA root-zone TLD",
    "  --format <json|markdown>     Output format",
    "  --output <path>              Write stdout payload to a file",
    "",
    "Input options:",
    "  --words-file <path|- >       Read newline words from a file or stdin",
    "  --input <path|- >            Read candidate JSON from a file or stdin",
    "",
    "Check/search options:",
    "  --concurrency <n>            Concurrent WHOIS checks",
    "  --with-descriptions          Fetch one short description for real-word results",
    "  --show-unknown               Include UNKNOWN WHOIS results",
    "  --progress-format <human|jsonl|silent>",
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
    "  Without --mode, --tlds, --all, or --max-price, generate/search uses a mixed strategy: .com plus a curated whole-word domain hack set.",
    "  Search now applies bounded progressive checking by default and may return partial results with search_truncated=true.",
  ].join("\n");
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const booleanFlags = new Set([
    "all",
    "help",
    "show-unknown",
    "with-definitions",
    "with-descriptions",
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

    const [key, inlineValue] = token.split("=", 2);
    const normalizedKey = key.slice(2);

    if (inlineValue !== undefined) {
      flags[normalizedKey] = inlineValue;
      continue;
    }

    if (booleanFlags.has(normalizedKey)) {
      flags[normalizedKey] = true;
      continue;
    }

    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${key}`);
    }
    flags[normalizedKey] = value;
    i += 1;
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
    mode: flags.mode,
    tlds: flags.tlds,
    wordsFile: flags["words-file"],
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
    mode: flags.mode,
    tlds: flags.tlds,
    limit: flags.limit,
    concurrency: flags.concurrency,
    maxChecks: flags["max-checks"],
    showUnknown: Boolean(flags["show-unknown"]),
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
    mode: flags.mode,
    tlds: flags.tlds,
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
      source_type: "provided",
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
    process.exit(command ? 0 : 1);
  }

  if (command === "prices") {
    const summary = getTldPricing({
      tlds: flags.tlds,
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
    } else {
      throw new Error("The check command requires `--input` or one or more domains/words.");
    }

    const summary = await checkCandidates({
      ...toCheckOptions(flags),
      candidates,
    });
    writeOutput(formatResults(summary, { format: flags.format || "json" }), flags);
    return;
  }

  if (command === "search") {
    const summary = await searchDomains({
      ...toGenerateOptions(flags),
      ...toCheckOptions(flags),
    });
    writeOutput(formatResults(summary, { format: flags.format || "json" }), flags);
    return;
  }

  if (command === "check-domain") {
    if (args.length === 0) {
      throw new Error("The check-domain command requires one or more domains.");
    }
    for (const input of args) {
      const result = await checkDomain(input);
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
