# Domain Search Skill

`domain-search` is an agent skill for finding and checking domain names. It helps agents generate traditional `.com` ideas, true whole-word domain hacks, and supplied brandable shortlists, then enrich results with availability, bundled pricing, registrar links, and optional descriptions.

The skill is intentionally unopinionated: it provides candidate generation and verification, while the user or agent handles taste, theme, and final naming judgment.

## Install

Requirements:

- Node.js 22 or newer
- `whois` available on your `PATH`
- network access for live WHOIS checks

Clone directly into a global Codex skills folder:

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/flatpickles/domain-search.git ~/.codex/skills/domain-search
```

Clone directly into a global Claude Code skills folder:

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/flatpickles/domain-search.git ~/.claude/skills/domain-search
```

Or clone somewhere stable and symlink the repo root:

```bash
git clone https://github.com/flatpickles/domain-search.git /path/to/domain-search
ln -s /path/to/domain-search ~/.codex/skills/domain-search
ln -s /path/to/domain-search ~/.claude/skills/domain-search
```

The skill root is the repository root. `SKILL.md` must be at the top level of the cloned or symlinked directory.

## Use

Ask your agent for domain ideas, shortlist checking, TLD pricing, or `.com`/domain-hack exploration. When no TLD or domain style is specified, the skill keeps the default mixed search path:

- traditional `.com` domains
- true whole-word domain hacks

Agents should present mixed results in separate traditional exact domain and domain hack groups when both are available.

You can also run the skill launcher directly:

```bash
./domain-search.sh search --words-file ./words.txt --limit 20 --progress-format human
./domain-search.sh check walk.in leashr.me --progress-format human
./domain-search.sh prices --max-price 20
```

## CLI

The skill is powered by a standalone Node.js CLI in [`cli/`](./cli). See [`cli/README.md`](./cli/README.md) for direct CLI installation and usage.
