---
name: domain-search
description: Use when you need an unopinionated domain-search tool for traditional .com domains, creative suffix domains, or provided brandable shortlists, then enrich the results with availability, pricing, registrar links, and optional descriptions.
---

# Domain Search

Use this skill when the user wants domain ideas, shortlist checking, TLD pricing, or either traditional `.com` domains or creative suffix domains for real words or invented names.

This skill is intentionally tool-like. It does not encode themes, vibes, or semantic filtering. If the user does not specify a TLD or domain style, use the default mixed search path:

- traditional `.com` domains
- creative suffix domains, sometimes called domain hacks

The usual patterns are:

1. use `search` when the user wants fresh domain ideas
2. use `generate` only when you explicitly want an intermediate filtering step
3. use `check` only when you already have a deliberate shortlist

Or:

1. create a coined or brandable shortlist externally
2. pass it directly to `check`

## Launcher

Use the bundled launcher script directly. Do not inspect the repository structure or try to locate the CLI implementation unless the launcher fails.

Claude Code:

```bash
${CLAUDE_SKILL_DIR}/scripts/domain-search.sh generate --words-file ./words.txt --limit 100
```

Generic local invocation:

```bash
./skill/scripts/domain-search.sh generate --words-file ./words.txt --limit 100
```

## Recommended Workflows

Open-ended discovery:

```bash
./skill/scripts/domain-search.sh search --words-file ./words.txt --limit 20 --progress-format human
```

Wordlist-driven generation when you want an intermediate filter step:

```bash
./skill/scripts/domain-search.sh generate --words-file ./words.txt --limit 200
```

Filter externally and check:

```bash
./skill/scripts/domain-search.sh check --input shortlist.json --limit 20 --progress-format human
```

Direct brandable shortlist:

```bash
./skill/scripts/domain-search.sh check --input shortlist.json --progress-format human
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

Use [`examples/brandable-shortlist.json`](./examples/brandable-shortlist.json) as the copyable template.

Plain text domain list:

```bash
printf "walk.in\nromp.in\nleashr.me\n" | ./skill/scripts/domain-search.sh check --input -
```

Use one-shot search only when you do not need an intermediate filtering step:

```bash
./skill/scripts/domain-search.sh search --words-file ./words.txt --limit 20 --progress-format human
```

Inspect bundled pricing:

```bash
./skill/scripts/domain-search.sh prices --max-price 20
```

Unknown-result fallback:

1. Run `check` first.
2. If a result is `AVAILABLE`, report it normally.
3. If a result is `UNKNOWN`, report it as inconclusive and include the registrar link.
4. Only if the user needs purchase-ready confirmation, optionally hand off those unknown domains to [$playwright](/Users/matt/.codex/skills/playwright/SKILL.md) for registrar-page verification.

## Notes

- `generate` is for wordlist-derived candidates, not a requirement for all workflows.
- For “find me domains” requests, start with `search`, not a hand-built shortlist.
- Do not start with ad hoc shortlist JSON for open-ended discovery requests.
- Do not use external `jq` trimming/ranking unless the user explicitly wants custom post-processing.
- Without `--mode` or `--tlds`, the default is a mixed search: `.com` plus a curated creative suffix set.
- With `--limit`, mixed-mode `search` and mixed-shape `check` apply built-in soft balancing so the final shortlist keeps some traditional and some creative results when both are available.
- Use `--mode exact` for traditional `.com` domains only.
- Use `--mode hack` for creative suffix domains only. "Domain hack" is secondary jargon; do not require the user to say it.
- `check` accepts candidate JSON from `--input <path>` or `--input -`.
- `check` is the preferred path for coined or agent-crafted shortlists.
- Use `--with-descriptions` only on final result sets.
- Bundled price data is dated and advisory; the tool should say it may now be out of date.
- Registration links are curated per TLD and may point to either a registrar search page or the official registry.
- Pricing source and registration source are separate; do not assume price metadata implies registrar support.
- If no reliable bundled registration target is known, report that the registration link is unavailable rather than guessing.
- When supplying coined names, include your own short `description` if you have one.
- Do not pull in [$playwright](/Users/matt/.codex/skills/playwright/SKILL.md) for ideation-only requests, large exploratory batches, or when the user did not ask for purchase-level confirmation.
