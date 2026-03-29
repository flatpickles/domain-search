#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { formatResults, searchDomains, checkDomain } = require("..");

function usage() {
  const script = path.basename(process.argv[1]);
  return [
    `Usage: ${script} <hack|exact|check> [options]`,
    "",
    "Commands:",
    "  hack   Search domain hacks from dictionary words",
    "  exact  Search exact domains across one or more TLDs",
    "  check  Check one or more domains directly",
    "",
    "Common options:",
    "  --tlds <list>              Comma-separated TLDs",
    "  --limit <n>               Stop after finding n available domains",
    "  --concurrency <n>         Concurrent WHOIS checks",
    "  --max-checks <n>          Maximum WHOIS checks",
    "  --words-file <path>       Override the bundled fallback word list",
    "  --output <path>           Write output to a file",
    "  --format <markdown|json>  Output format for search commands",
    "",
    "Word filtering:",
    "  --min-word-length <n>",
    "  --max-word-length <n>",
    "",
    "Hack-only options:",
    "  --min-label-length <n>",
    "  --max-domain-length <n>",
  ].join("\n");
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];

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
    const value = inlineValue ?? argv[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${key}`);
    }
    flags[key.slice(2)] = value;
    if (!inlineValue) i += 1;
  }

  return {
    command: positional[0],
    args: positional.slice(1),
    flags,
  };
}

function toSearchOptions(command, flags) {
  return {
    mode: command,
    tlds: flags.tlds,
    limit: flags.limit,
    concurrency: flags.concurrency,
    maxChecks: flags["max-checks"],
    wordsFile: flags["words-file"],
    format: flags.format || "markdown",
    minWordLength: flags["min-word-length"],
    maxWordLength: flags["max-word-length"],
    minLabelLength: flags["min-label-length"],
    maxDomainLength: flags["max-domain-length"],
  };
}

async function run() {
  const { command, args, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || !command) {
    process.stdout.write(`${usage()}\n`);
    process.exit(command ? 0 : 1);
  }

  if (command === "check") {
    if (args.length === 0) {
      throw new Error("The check command requires one or more domain arguments.");
    }
    for (const input of args) {
      const result = await checkDomain(input);
      process.stdout.write(`${result.status}\t${result.domain}\n`);
    }
    return;
  }

  if (!["hack", "exact"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const summary = await searchDomains(toSearchOptions(command, flags));
  const output = formatResults(summary, { format: flags.format });

  if (flags.output) {
    fs.writeFileSync(flags.output, output);
  } else {
    process.stdout.write(output);
  }

  process.stderr.write(
    `${JSON.stringify(
      {
        mode: summary.mode,
        tlds: summary.tlds,
        checked: summary.checked,
        candidatePool: summary.candidatePool,
        available: summary.available,
        output: flags.output || null,
      },
      null,
      2,
    )}\n`,
  );
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
