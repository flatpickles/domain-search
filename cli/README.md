# domain-search CLI

`domain-search` is the Node.js CLI used by the Domain Search skill. It can generate and check traditional `.com` domains, true whole-word domain hacks, and supplied brandable shortlists.

The CLI enriches results with WHOIS availability, bundled TLD pricing, registrar links, and optional descriptions.

## Install

Requirements:

- Node.js 22 or newer
- `whois` available on your `PATH`
- network access for live WHOIS checks

From a clone of the repo:

```bash
cd cli
npm install -g .
domain-search --help
```

Or run directly without a global install:

```bash
cd cli
node bin/domain-search.js --help
```

## Basic Usage

Find available domains from a word list:

```bash
domain-search search --words-file ./words.txt --limit 20 --progress-format human
```

Check an existing shortlist:

```bash
domain-search check --input shortlist.json --progress-format human
```

Inspect bundled TLD pricing:

```bash
domain-search prices --max-price 20
```

## Commands

- `search`: generate candidates and check availability
- `generate`: generate ranked candidates without WHOIS checks
- `check`: check a supplied shortlist, JSON file, plain text domain list, or direct domains/names
- `prices`: show bundled TLD pricing and registrar metadata

Without `--mode` or `--tlds`, `search` and `generate` use a mixed strategy: traditional `.com` domains plus a curated set of whole-word domain hacks.

Useful explicit modes:

```bash
domain-search search --mode exact --words-file ./words.txt --limit 20 --progress-format human
domain-search search --mode hack --words-file ./words.txt --limit 20 --progress-format human
domain-search search --mode brandable --words-file ./words.txt --limit 20 --progress-format human
```

`--mode brandable` uses explicit source words and emits `.com` candidates only.

## Library

```js
const {
  checkCandidates,
  checkDomain,
  fetchDescription,
  formatResults,
  generateBrandableCandidates,
  generateCandidates,
  generateExactCandidates,
  generateHackCandidates,
  getTldPricing,
  searchDomains,
} = require("domain-search");
```

## Tests

```bash
npm test
```
