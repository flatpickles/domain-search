---
name: domain-search
description: Use when you need an unopinionated domain-search tool that works for both real-word exploration and provided brandable shortlists, then enriches results with availability, pricing, registrar links, and optional descriptions.
---

# Domain Search

Use this skill when the user wants domain ideas, shortlist checking, TLD pricing, or hack/exact searches for either real words or invented names.

This skill is intentionally tool-like. It does not encode themes, vibes, or semantic filtering. The usual patterns are:

1. generate a ranked candidate set from words
2. filter externally based on the user's nuance
3. check the shortlist

Or:

1. create a coined or brandable shortlist externally
2. pass it directly to `check`

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

## Recommended Workflows

Wordlist-driven generation:

```bash
./skill/scripts/domain-search.sh generate --mode hack --tlds st,re,se,it --words-file ./words.txt --limit 200
```

Filter externally and check:

```bash
./skill/scripts/domain-search.sh check --input shortlist.json --limit 20 --progress-format human
```

Direct brandable shortlist:

```bash
./skill/scripts/domain-search.sh check --input shortlist.json --progress-format human
```

Plain text domain list:

```bash
printf "walk.in\nromp.in\nleashr.me\n" | ./skill/scripts/domain-search.sh check --input -
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

- `generate` is for wordlist-derived candidates, not a requirement for all workflows.
- `check` accepts candidate JSON from `--input <path>` or `--input -`.
- `check` is the preferred path for coined or agent-crafted shortlists.
- Use `--with-descriptions` only on final result sets.
- Bundled price data is dated and advisory; the tool should say it may now be out of date.
- When supplying coined names, include your own short `description` if you have one.
