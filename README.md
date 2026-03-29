# domain-search

`domain-search` is a reusable domain-hunting toolkit. It searches dictionary words for either:

- domain hacks, where the TLD is used as part of the word
- exact domains across one or more target TLDs such as `.com`, `.net`, or `.org`

The repo ships as a reusable Node library, a CLI, and a bundled Codex Skill.

## Requirements

- Node.js 22 or newer
- `whois` on your `PATH`
- network access for live WHOIS lookups
- optional network access for definition fetching

The repo includes a bundled fallback wordlist at [`data/words.txt`](./data/words.txt), and you can override it with `--words-file`.

## CLI

Hack search:

```bash
node bin/domain-search.js hack \
  --tlds st,re,se,it \
  --limit 20 \
  --max-domain-length 10
```

Exact-TLD search:

```bash
node bin/domain-search.js exact \
  --tlds com,net,org \
  --limit 20 \
  --min-word-length 6 \
  --max-word-length 10
```

Direct checks:

```bash
node bin/domain-search.js check chemi.st example.com
```

Offline-ish local testing is easier if you disable live definition lookups:

```bash
DOMAIN_SEARCH_DISABLE_DEFINITIONS=1 node bin/domain-search.js exact --tlds com
```

## Library

```js
const {
  searchDomains,
  generateHackCandidates,
  generateExactCandidates,
  checkDomain,
  fetchDefinition,
  formatResults,
} = require("domain-search");
```

## Repo layout

- [`bin/domain-search.js`](./bin/domain-search.js) is the CLI.
- [`lib/`](./lib) contains reusable search logic.
- [`skill/`](./skill) contains the Codex Skill.
- [`examples/`](./examples) contains sample output only.

This public repo intentionally omits any private curated inventory.

## Add To Codex Or Claude Code

The skill lives in [`skill/SKILL.md`](./skill/SKILL.md). The recommended setup for both tools is:

1. Clone this repo somewhere local.
2. Symlink the repo's `skill/` directory into the tool's personal skills folder.

Codex local install:

```bash
mkdir -p ~/.codex/skills
ln -s /path/to/domain-search/skill ~/.codex/skills/domain-search
```

Claude Code personal install:

```bash
mkdir -p ~/.claude/skills
ln -s /path/to/domain-search/skill ~/.claude/skills/domain-search
```

Claude Code project-local install:

```bash
mkdir -p .claude/skills
ln -s /path/to/domain-search/skill .claude/skills/domain-search
```

Symlinking is preferred over copying because the skill expects the packaged CLI to remain in the same checkout.

Public references:

- OpenAI's Codex app announcement says skills can be checked into a repository and then used across the app, CLI, and IDE extension: [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/).
- Anthropic's Claude Code docs describe personal skills at `~/.claude/skills/<skill-name>/SKILL.md`, project skills at `.claude/skills/<skill-name>/SKILL.md`, and sharing by committing `.claude/skills/` to version control: [Extend Claude with skills](https://code.claude.com/docs/en/slash-commands).

In practice, this repo keeps a single canonical `skill/` directory and lets each tool consume it by symlink.

## Tests

Run:

```bash
npm test
```
