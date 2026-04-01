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

If you do not specify `--mode` or `--tlds`, `generate` and `search` default to a mixed strategy:

- traditional `.com` domains
- a curated set of whole-word domain hacks

Search now applies bounded progressive checking by default. When a `--limit` is present, the tool checks ranked candidates in stages and may stop early once it has enough available results. Search output now includes:

- `search_truncated`
- `remaining_candidates`
- `max_checks_applied`

For open-ended discovery requests, `search` is the standard path. `check` is for verifying a pre-existing shortlist.

## Agent Usage

When an agent is using this tool for an open-ended request, the default should stay mixed unless the user explicitly asks for `.com` only, a single TLD, or domain hacks only.

When mixed mode is used, the final answer should keep both shapes visible instead of collapsing into a mostly-`.com` list. A good default is two sections:

- traditional exact domains
- domain hacks

This guidance is about how to present results, not a change to the CLI. The CLI default remains mixed, and the built-in soft balancing still applies when mixed mode is active and `--limit` is set.

Real-word workflow:

```bash
node bin/domain-search.js generate \
  --words-file ./words.txt \
  --limit 100
```

Then, if you want an intermediate filtering step, generate candidates first and pass a curated shortlist back into `check`.
For open-ended discovery without an explicit TLD, that shortlist should come from tool output rather than agent-invented non-`.com` ideas.

Domain hacks only:

```bash
node bin/domain-search.js search --mode hack --words-file ./words.txt --limit 20
```

Traditional `.com` only:

```bash
node bin/domain-search.js search --mode exact --words-file ./words.txt --limit 20
```

Brandable shortlist workflow:

```bash
cat shortlist.json | node bin/domain-search.js check --input - --progress-format human
```

Shorter brandable `.com` exploration from an explicit source list:

```bash
node bin/domain-search.js search --mode brandable --words-file ./words.txt --limit 20 --progress-format human
```

`--mode brandable` is explicit-only. It does not use the bundled default dictionary, and in v1 it emits `.com` candidates only.
It now hard-filters corporate filler tails such as `co`, `company`, `corp`, `inc`, `llc`, and `ltd` so exploratory runs do not drift into forced `...co.com` names.

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

For ordinary “find me the best 20 domains” use cases, prefer `search --limit 20` instead of building temp JSON files and trimming with external `jq`.

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
  --words-file ./words.txt \
  --limit 20 \
  --progress-format human
```

When bounded search stops early, `search_truncated: true` means there are still ranked candidates left unchecked in the generated pool.
Hack results are also stricter now: the label plus the TLD must read as one ordinary word. `chemi.st`, `apprai.se`, and `truck.in` are valid shapes; arbitrary suffix domains like `steady.st` or `trucks.in` are not, and phrase-like joins such as `tune.me` are not part of the default full-word hack set.
When the user did not explicitly ask for a TLD, do not treat non-`.com` exact domains or coined non-`.com` brandables as part of the default mixed result space.
If the confirmed-available full-word hack pool is thin, return fewer results and say so instead of padding with short suffix domains or coined non-`.com` alternatives.

When mixed mode is active and `--limit` is set, the tool applies soft balancing to preserve some traditional `.com` and some domain hacks when both are available.

Example mixed-mode presentation for an open-ended request:

```md
Traditional exact domains
- verdelore.com
- mosshalo.com
- leafrune.com

Domain hacks
- chemi.st
- apprai.se
- truck.in
```

Example explicit `.com`-only search:

```bash
node bin/domain-search.js search --mode exact --words-file ./words.txt --limit 20 --progress-format human
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

The mixed default uses a curated domain-hack subset rather than the full hack-friendly TLD set. This keeps default searches more usable and less noisy. Use `--mode hack` if you want the broader explicit hack search behavior.

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
  generateBrandableCandidates,
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

`UNKNOWN` is a real outcome for some supported TLDs when upstream registry responses are ambiguous or transient.
TLDs outside the bundled supported set are now rejected up front so they do not leak into results as inconclusive.
Default `check` and `search` output should include only domains confidently classified as `AVAILABLE`.

Recommended fallback ladder:

1. Run `check` first.
2. If a result is `AVAILABLE`, report it as available.
3. If a result is `UNKNOWN`, include the registrar link and say WHOIS was inconclusive.

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
