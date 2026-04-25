# domain-search

`domain-search` is a Node.js CLI for finding and checking domain names. It can generate traditional `.com` ideas, true whole-word domain hacks, and supplied brandable shortlists, then enrich results with WHOIS availability, bundled TLD pricing, registrar links, and optional descriptions.

The tool is intentionally unopinionated: it helps produce and verify candidates, while taste, theme, and final naming judgment stay with the user.

## Install From GitHub

Requirements:

- Node.js 22 or newer
- `whois` available on your `PATH`
- network access for live WHOIS checks

Install the CLI directly from GitHub:

```bash
npm install -g github:flatpickles/domain-search
domain-search --help
```

Or clone the repo and run it locally:

```bash
git clone https://github.com/flatpickles/domain-search.git
cd domain-search
npm install
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
- `check`: check a supplied shortlist, JSON file, or plain text domain list
- `prices`: show bundled TLD pricing and registrar metadata

Without `--mode` or `--tlds`, `search` uses a mixed strategy: traditional `.com` domains plus a curated set of whole-word domain hacks.

## Codex Skill

The bundled skill lives in [`skill/`](./skill). After cloning the repo, install it with:

```bash
mkdir -p ~/.codex/skills
ln -s "$PWD/skill" ~/.codex/skills/domain-search
```

The skill uses [`skill/scripts/domain-search.sh`](./skill/scripts/domain-search.sh), which resolves the repo path even when the skill directory is symlinked.
