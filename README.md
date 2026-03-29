# domain-search

`domain-search` is a phase-based, unopinionated domain search toolkit for agents and humans. It supports both:

- real-word, wordlist-driven exploration
- invented or brandable shortlists supplied directly by a user or agent

It helps you:

- generate ranked candidates from words and TLDs
- check direct shortlists of names or domains
- filter externally however you want
- attach bundled TLD pricing, registration links, and optional short descriptions

The tool does not try to understand themes, aesthetics, or semantic nuance. It is designed to be composed with external filtering and taste judgment.

## Requirements

- Node.js 22 or newer
- `whois` on your `PATH`
- network access for live WHOIS lookups
- optional network access for description fetching

The bundled wordlist at [`data/words.txt`](./data/words.txt) is a convenience, not a requirement.

## CLI

The main commands are:

- `generate`: rank wordlist-derived candidates only
- `check`: WHOIS-check a shortlist, JSON candidate input, or direct domains/names
- `search`: convenience wrapper for `generate` + `check`
- `prices`: inspect bundled TLD pricing and registrar metadata

Real-word workflow:

```bash
node bin/domain-search.js generate \
  --mode hack \
  --tlds st,re,se,it \
  --words-file ./words.txt \
  --limit 100
```

Then filter externally and check:

```bash
node bin/domain-search.js generate --mode hack --words-file ./words.txt \
  | jq '.candidates[:20]' \
  | node bin/domain-search.js check --input - --progress-format human
```

Brandable shortlist workflow:

```bash
cat shortlist.json | node bin/domain-search.js check --input - --progress-format human
```

Structured shortlist contract:

```json
[
  {
    "domain": "leashr.me",
    "label": "leashr",
    "word": "leashr",
    "candidate_type": "brandable",
    "source_type": "provided",
    "description": "Friendly dog-walking brand.",
    "description_source": "agent",
    "score": 31
  }
]
```

Copyable example: [`skill/examples/brandable-shortlist.json`](./skill/examples/brandable-shortlist.json)

Plain text domain list workflow:

```bash
printf "walk.in\nromp.in\nleashr.me\n" | node bin/domain-search.js check --input -
```

Show unknowns on a final shortlist:

```bash
node bin/domain-search.js check --input shortlist.json --show-unknown --progress-format human
```

One-shot search:

```bash
node bin/domain-search.js search \
  --mode exact \
  --tlds com,net,org \
  --words-file ./words.txt \
  --limit 20 \
  --progress-format human
```

Bundled pricing:

```bash
node bin/domain-search.js prices --max-price 20
```

## Descriptions

Results use a unified `description` field:

- for real words, `--with-descriptions` can fetch one short dictionary-backed description
- for brandables, agent- or user-supplied descriptions are preserved
- if no description is available, the field remains null

This is intentional: not every good domain candidate is a dictionary word.

## Pricing And Registrars

Bundled TLD pricing is advisory, static, and intentionally dated. The current bundle was updated as of `2026-03-29` from Namecheap's public TLD pricing page and may now be out of date.

The bundle now includes a broader set of hack-friendly and business-relevant TLDs, but coverage is still incomplete. Unknown or unsupported TLDs remain representable in output.

Result objects include:

- bundled annual price metadata when the TLD is known
- a preferred registrar when configured
- an actionable registration target when one is curated
- registration source metadata that is separate from pricing source metadata

Registration links are TLD-aware. They may point to either:

- a verified registrar search page
- an official registry registration page
- an official registry homepage

If no reliable bundled registration target is known, the registration link is left blank instead of guessed. Cloudflare can remain an advisory preferred registrar, but it is not used as the actionable link unless a usable public registration URL is bundled.

## Library

```js
const {
  generateCandidates,
  checkCandidates,
  searchDomains,
  getTldPricing,
  generateHackCandidates,
  generateExactCandidates,
  checkDomain,
  fetchDescription,
  formatResults,
} = require("domain-search");
```

## Repo Layout

- [`bin/domain-search.js`](./bin/domain-search.js): CLI entrypoint
- [`lib/`](./lib): search, pricing, formatting, and WHOIS logic
- [`data/tlds.json`](./data/tlds.json): bundled TLD pricing metadata
- [`skill/`](./skill): packaged skill plus launcher script

## Add To Codex Or Claude Code

The skill lives in [`skill/SKILL.md`](./skill/SKILL.md). The recommended setup for both tools is:

1. Clone this repo somewhere local.
2. Symlink the repo's `skill/` directory into the tool's personal or project skill folder.

Codex:

```bash
mkdir -p ~/.codex/skills
ln -s /path/to/domain-search/skill ~/.codex/skills/domain-search
```

Claude Code personal:

```bash
mkdir -p ~/.claude/skills
ln -s /path/to/domain-search/skill ~/.claude/skills/domain-search
```

Claude Code project-local:

```bash
mkdir -p .claude/skills
ln -s /path/to/domain-search/skill .claude/skills/domain-search
```

The packaged launcher script is [`skill/scripts/domain-search.sh`](./skill/scripts/domain-search.sh). It resolves the real repo path, so the skill can invoke the CLI even when `skill/` is symlinked into another tool directory.

When using the skill, call the launcher directly and do not inspect the repository structure unless the launcher fails.

Public references:

- OpenAI's Codex app announcement notes that skills can be checked into a repository and used across the app, CLI, and IDE extension: [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/).
- Anthropic's Claude Code docs describe personal and project skill directories and the `SKILL.md` format: [Extend Claude with skills](https://code.claude.com/docs/en/slash-commands).

## Unknown Results

`UNKNOWN` is a real outcome for some TLDs. Treat it as inconclusive, not available.

Recommended fallback ladder:

1. Run `check` first.
2. If a result is `AVAILABLE`, report it normally.
3. If a result is `UNKNOWN`, include the registrar link and say WHOIS was inconclusive.
4. Only if the user needs purchase-ready confirmation, optionally use [$playwright](/Users/matt/.codex/skills/playwright/SKILL.md) to verify the registrar page for those unknown domains.

Do not pull in [$playwright](/Users/matt/.codex/skills/playwright/SKILL.md) for ideation-only requests, exploratory batches, or when the user did not ask for purchase-level confirmation.

Example output shape:

```json
{
  "domain": "chemi.st",
  "status": "AVAILABLE",
  "registration_provider": "ST Registry",
  "registration_kind": "registry_homepage",
  "registration_url": "https://en.nic.st/",
  "registration_note": "No verified registrar search link is bundled for this TLD; using the official registry homepage."
}
```

## Tests

Run:

```bash
npm test
```
