# domain-search CLI

`domain-search` is the Node.js CLI used by the Domain Search skill. It can generate and check traditional `.com` domains, true whole-word domain hacks, delegated IANA root-zone TLDs, and supplied brandable shortlists.

The CLI enriches results with WHOIS/RDAP availability, bundled TLD pricing, registrar metadata, per-domain direct registration/search links where available, and optional descriptions. Verification accepts any TLD in the bundled IANA root-zone snapshot. Bootstrap RDAP can confirm registered domains, but bootstrap not-found responses are inconclusive unless the TLD has curated availability handling.

Registrar metadata prefers Cloudflare for TLDs in the bundled Cloudflare Registrar support snapshot, uses Namecheap as the default fallback for other public root-zone TLDs, and preserves dedicated registry links for TLDs that need them. Checked result JSON includes `direct_registration_url` when the tool has a domain-specific action link.

## Install

Requirements:

- Node.js 22 or newer
- `whois` available on your `PATH`
- network access for live WHOIS/RDAP checks

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

Use every delegated root-zone TLD for an explicit search:

```bash
domain-search search --mode exact --all --words-file ./words.txt --limit 20 --progress-format human
```

## Commands

- `search`: generate candidates and check availability
- `generate`: generate ranked candidates without WHOIS checks
- `check`: check a supplied shortlist, JSON file, plain text domain list, or direct domains/names
- `prices`: show bundled TLD pricing and registrar metadata

Without `--mode`, `--tlds`, `--all`, or `--max-price`, `search` and `generate` use a mixed strategy: traditional `.com` domains plus a curated set of whole-word domain hacks.

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
