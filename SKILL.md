---
name: domain-search
description: Find domain ideas or check a shortlist with live availability, bundled TLD pricing, and registrar links. Supports exact TLDs, whole-word domain hacks, and explicitly requested brandable or shortlink names.
---

# Domain Search

Use the bundled `domain-search.sh` launcher by its absolute path under this skill directory. It works from any working directory, including a symlinked installation. Use `--help` for flags; inspect implementation files only for debugging or maintenance.

The CLI generates and verifies candidates; the agent supplies theme, naming judgment, and accurate word meanings. Carry forward the user's liked names, rejected directions, length constraints, TLDs, budget, and requested count from the conversation. Choose relevant source words before running discovery. A high tool score measures spelling heuristics, not semantic fit or brand quality.

## Choose the search shape

| User intent | Workflow |
| --- | --- |
| Fresh ideas, no TLD/style specified | `search --words-file ...` for mixed `.com` plus whole-word hacks |
| `.com` only | `search --mode exact --tlds com --words-file ...` |
| Specific extensions, such as `.app` or `.com`/`.net` | `search --mode exact --tlds app --words-file ...` or `--tlds com,net` |
| Full names under two-letter TLDs | `search --mode exact --tld-length 2 --words-file ...` |
| Whole-word hacks only | `search --mode hack --words-file ...` |
| Short coined `.com` blends from explicit source words | `search --mode brandable --words-file ...` only when requested |
| A provided domain or deliberate shortlist | `check domain.app other.com --show-all` or `check --input shortlist.json --show-all` |
| Intermediate semantic filtering is useful | `generate`, curate the output, then `check` |

A TLD-length constraint preserves the complete label: four-letter bird names with two-letter TLDs means `ibis.xx`, not `ib.is`. `--tld-length` selects delegated ASCII TLDs by length; it does not certify public registration or registrant eligibility. `--all` selects the bundled root-zone snapshot, including restricted and closed TLDs.

A price cap alone preserves mixed discovery. `--max-price` intersects the selected TLDs using dated bundled prices and excludes TLDs with unknown prices. It is not a live quote or proof that a particular domain meets the budget. Use `--mode mixed` to request mixed discovery explicitly.

For default discovery, hacks must join into one ordinary word (`apprai.se` → `appraise`; colloquial `truck.in` → `truckin` is supported). Do not pad with arbitrary suffixes or phrases such as `trucks.in` or `tune.me`. Keep non-`.com` exact names within the user's explicit TLD scope.

Explicit user requests for acronyms, abbreviations, phonetic spellings, phrases, or personal-brand shortlinks override that default. For example, a request mentioning `nt.es` or `notes.pics` calls for a deliberate shortlist checked directly; describe these as shortlinks or brand spellings rather than ordinary-word hacks. Do not reject a user's supplied domain because it falls outside discovery taste rules.

Avoid appending corporate filler such as `co` or `company` merely to force availability. Existing words such as `disco` and `zinc` are valid. Prefer natural names and a shorter strong list over contrived compounds added to reach a count.

For iterative naming with source kinds, rationales, priorities, phonetic alternatives, or saved likes/rejections, read [references/naming-inputs.md](references/naming-inputs.md). Use `--sources-file` and `--preferences-file`; do not treat supplied commonness ratings as corpus statistics.

## Run a bounded live pass

These examples use `./domain-search.sh` from the skill root; elsewhere use its absolute path.

```bash
./domain-search.sh search --words-file ./words.txt --limit 20 --max-checks 480 --progress-format human --output ./results.json
./domain-search.sh search --mode exact --tld-length 2 --words-file ./birds.txt --min-word-length 4 --max-word-length 4 --limit 30 --max-checks 600 --output ./birds.json
./domain-search.sh check melodybook.app musicnotes.com --show-all --progress-format human
./domain-search.sh prices --tlds com,app --max-price 30
```

Supplied source words retain short names by default; the bundled dictionary defaults to 5–10 letters. Use `--min-word-length` / `--max-word-length` for source words, `--min-label-length` for the part before the dot, and `--max-domain-length` for the entire domain including the dot and TLD. Brandable generation combines 3–8-letter source tokens into 6–10-letter `.com` labels; use direct checking for longer coined names.

Choose a useful word pool, result count, and check budget before the first live call. `search --limit N` stops after finding N available domains or exhausting its budget/pool. `check --limit N` only trims the displayed results; use `--max-checks` to bound network work. Omit the result limit and set a sufficient check budget for an explicitly exhaustive pass. Report coverage rather than claiming “all” when checks remain or some are inconclusive.

Live checks need network access and may require the host's sandbox approval. Reuse authorized launcher access where available. Do not trigger redundant lookups to retrieve statuses: JSON `checks` records every checked domain, status, and timestamp, even when `results` shows only available names. `--show-all` displays all statuses for shortlist questions; `--show-unknown` is for inconclusive-result reporting. Ordinary discovery results should stay available-only.

Do not automatically broaden an ordinary request just because a result set is thin. If the user explicitly asks to keep searching, continue within their requested scope and total check budget, using new candidates and existing results to avoid duplicates. Stop at the requested count, budget, exhausted useful ideas, or persistent lookup failures. If live access is denied, generate unverified ideas when useful and label them clearly.

## Continue an iterative search

Use `--session /path/to/project/naming.session.json` on search/check to checkpoint a portable candidate pool and all checks. Use the same command with `--resume ... --limit N --max-checks N` when the user asks for more. Resume returns newly checked results, skipping fresh checks (available: 1 hour; registered: 24 hours; unknown: 5 minutes). `--exclude-checked previous.json` avoids fresh repeats in a new pool; `--freshness-hours 0` explicitly rechecks finalists. Do not change candidate inputs on resume. Save sessions with the project, outside the installed skill; retain the file when leaving a temporary environment.

## Interpret and present results

- `AVAILABLE` is a positive WHOIS/curated RDAP indication, not a completed registrar checkout. Reserved names, premiums, or eligibility requirements may still prevent ordinary registration. `REGISTERED` means taken; `UNKNOWN` is inconclusive. An absent website or DNS record proves neither availability nor registration.
- Generic bootstrap RDAP not-found responses remain `UNKNOWN`; they must not be promoted to available. Do not repeat the same failed batch to make unknowns disappear.
- Read `checked`, `candidatePool`, `remaining_candidates`, and `stop_reason` (`result_limit`, `max_checks`, or `exhausted`). Explain incomplete coverage briefly when relevant. Results include `checked_at`; do not present old saved checks as current.
- Present mixed results in separate traditional exact domain and domain hack groups, retaining both when available. Include the joined word for hacks and short meanings or naming rationale when useful. `--with-descriptions` fetches definitions for available real-word candidates; supplied descriptions are preserved.
- Link available domain names to `direct_registration_url` when provided. Otherwise use `registration_url` if it is a verified registrar link, and identify generic dashboards or registry pages accurately. Cloudflare is preferred where supported; do not guess Namecheap or other registrar support from delegation alone.
- Show `registration_restriction` when present and de-emphasize restricted TLDs in broad suggestions. Missing restriction metadata is not proof of unrestricted registration. Verify eligibility before asserting a TLD is registerable for a particular user.
- Label prices as dated TLD estimates, not domain-specific registration or renewal quotes. Verify current registrar pricing for purchase finalists when requested.
- Domain availability does not check App Store names, product collisions, social handles, or trademarks. When requested, research those separately and keep their findings distinct from domain status.

## Shortlist input

`check --input` accepts newline-separated complete domains, an array of domain strings/objects, or JSON from `generate` / a previous result. Equivalent normalized domains are checked once; the first entry's descriptive metadata is retained. Invalid domains and undelegated TLDs fail before lookups.

```json
[
  {"domain": "melodybook.app", "description": "A literary name for a musical notebook."},
  "nt.es"
]
```

For all CLI flags, limits, and library usage, consult [cli/README.md](cli/README.md).
