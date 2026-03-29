---
name: domain-search
description: Use when you need an unopinionated domain-search tool that can generate candidates, let you filter them externally, and then check availability with registrar and pricing metadata.
---

# Domain Search

Use this skill when the user wants domain ideas, shortlist checking, TLD pricing, or domain hacks and exact-TLD searches based on real words.

This skill is intentionally tool-like. It does not encode themes, vibes, or semantic filtering. The usual pattern is:

1. generate a ranked candidate set
2. filter externally based on the user's nuance
3. check the shortlist

## Launcher

Use the bundled launcher script so the CLI can be found even if this skill directory is symlinked elsewhere.

Claude Code:

```bash
${CLAUDE_SKILL_DIR}/scripts/domain-search.sh generate --mode hack --words-file ./words.txt --limit 100
```

Generic local invocation:

```bash
./skill/scripts/domain-search.sh generate --mode hack --words-file ./words.txt --limit 100
```

## Recommended Workflow

Generate candidates:

```bash
./skill/scripts/domain-search.sh generate --mode hack --tlds st,re,se,it --words-file ./words.txt --limit 200
```

Filter externally however you want, then check:

```bash
./skill/scripts/domain-search.sh check --input shortlist.json --limit 20 --progress-format human
```

Use one-shot search only when you do not need an intermediate filtering step:

```bash
./skill/scripts/domain-search.sh search --mode exact --tlds com,net,org --words-file ./words.txt --limit 20 --progress-format human
```

Inspect bundled pricing:

```bash
./skill/scripts/domain-search.sh prices --max-price 20
```

## Notes

- `generate` never performs WHOIS or definition lookups.
- `check` accepts candidate JSON from `--input <path>` or `--input -`.
- `search` is a convenience wrapper around `generate` plus `check`.
- Use `--with-definitions` only on final result sets.
- Use `--show-unknown` when registry ambiguity matters.
- Bundled price data is dated and advisory; the tool should state that it may now be out of date.
