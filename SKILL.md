---
name: domain-search
description: Use when you need an unopinionated domain-search tool for traditional .com domains, true whole-word domain hacks, or provided brandable shortlists, then enrich the results with availability, pricing, registrar links, and optional descriptions.
---

# Domain Search

Use this skill when the user wants domain ideas, shortlist checking, TLD pricing, or either traditional `.com` domains or true whole-word domain hacks for real words or invented names.

This skill is intentionally tool-like. It does not encode themes, vibes, or semantic filtering. If the user does not specify a TLD or domain style, use the default mixed search path:

- traditional `.com` domains
- true whole-word domain hacks, where the label plus the TLD reads as the target word

Only override that mixed default when the user explicitly asks for a constraint such as `.com` only, one specific TLD, or domain hacks only.

Use `--mode brandable` when the user explicitly wants shorter brandable `.com` ideas from a supplied source list.
Do not hand-build exploratory shortlist names that just append corporate filler like `co`, `company`, `corp`, `inc`, `llc`, or `ltd` to force availability.

The usual patterns are:

1. use `search` when the user wants fresh domain ideas
2. use `generate` only when you explicitly want an intermediate filtering step
3. use `check` only when you already have a deliberate shortlist

Or:

1. only use an external shortlist when the user already supplied it, or when the user explicitly asked for `.com` brandables from a supplied source list
2. pass that shortlist directly to `check`

## Prompt-Minimizing Live Checks

`search` and `check` run live WHOIS/RDAP availability checks. In sandboxed agents such as Codex, these may require approval to run outside the sandbox.

When verified availability is needed, choose one appropriately sized live command for the user's request instead of running a small check and then an automatic wider follow-up check.
If the user asked for a larger or more exhaustive result set, set `--limit` and, when useful, `--max-checks` on the first `search` or `check` command.
Do not run a second wider `check` just because `search_truncated`, `remaining_candidates`, or a thin result set shows more candidates are available to inspect; report that fact and let the user decide whether to request a deeper pass.

Do not use `--show-unknown` in normal final-result searches. Only include unknowns when the user explicitly asks for inconclusive results, diagnostics, or broader status reporting.
If live-check approval is denied, fall back to `generate` when useful and label the ideas as unverified.

## Launcher

Use the bundled launcher script directly. Do not inspect the repository structure or try to locate the CLI implementation unless the launcher fails.

Claude Code:

```bash
${CLAUDE_SKILL_DIR}/domain-search.sh generate --words-file ./words.txt --limit 100
```

Generic local invocation:

```bash
./domain-search.sh generate --words-file ./words.txt --limit 100
```

## Recommended Workflows

Open-ended discovery:

```bash
./domain-search.sh search --words-file ./words.txt --limit 20 --progress-format human
```

When you use the default mixed search path, present the final results in two sections:

- traditional exact domains
- domain hacks

If both shapes survive checking, keep both visible in the final answer. Do not rerank a mixed run into a mostly-`.com` final list unless the user explicitly asked for that outcome.

Wordlist-driven generation when you want an intermediate filter step:

```bash
./domain-search.sh generate --words-file ./words.txt --limit 200
```

Filter tool output externally and check:

```bash
./domain-search.sh check --input shortlist.json --limit 20 --progress-format human
```

Direct provided shortlist:

```bash
./domain-search.sh check --input shortlist.json --progress-format human
```

When presenting final checked results, preserve actionable per-domain links. If a result has
`direct_registration_url`, render the available domain itself as a Markdown link to that URL.
Otherwise use `registration_url` only when it is a registrar link. Do not collapse available
domains into generic "Cloudflare Domains" or "Namecheap search" starting points when per-domain
links are present. If only a generic dashboard or registry page is bundled, say that directly.

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

Plain text domain list:

```bash
printf "walk.in\nromp.in\nleashr.me\n" | ./domain-search.sh check --input -
```

Use one-shot search only when you do not need an intermediate filtering step:

```bash
./domain-search.sh search --words-file ./words.txt --limit 20 --progress-format human
```

Search now applies bounded progressive checking by default. When a ranked search stops early, use `search_truncated`, `remaining_candidates`, and `max_checks_applied` in the output to explain that more ranked candidates were available but not checked yet.
Do not run an automatic wider follow-up check when a search stops early; summarize the checked results and mention that more candidates remain unchecked.
Do not hand-build arbitrary non-`.com` domains and call them hacks.
When the user did not explicitly ask for a TLD, do not invent non-`.com` exact domains or coined non-`.com` brandables like `steady.st`, `equilia.in`, or `steadia.in`.
For open-ended unspecified-TLD discovery, use `search` and keep the result space to `.com` exact domains plus true whole-word hacks.
For hack output, the label plus the TLD must read as a single ordinary word, for example `truck.in` -> `truckin`.
Do not relax this into a phrase, sentence fragment, or multiple-word reading. Reject examples like `tune.me`, `level.ed`, or `driftless.in` when the joined reading is not one real word.
Reject splits like `trucks.in`, `steady.st`, or `anchor.st` when the join does not read as a real full-word hack.
If confirmed-available full-word hacks are scarce, return fewer results and say so. Do not pad with short suffix domains, phrase-like hacks, or coined non-`.com` alternatives.

Inspect bundled pricing:

```bash
./domain-search.sh prices --max-price 20
```

Unknown-result fallback:

1. Run `check` first.
2. If the requested TLD is outside the delegated IANA root-zone set, the tool should reject it up front instead of surfacing an inconclusive result.
3. Only surface results that the tool classifies as `AVAILABLE` in default output.
4. If a result is `UNKNOWN`, report it as inconclusive and include the registrar link.

## Notes

- `generate` is for wordlist-derived candidates, not a requirement for all workflows.
- For “find me domains” requests, start with `search`, not a hand-built shortlist.
- Do not start with ad hoc shortlist JSON for open-ended discovery requests.
- For open-ended discovery without an explicit TLD, do not use `check` on agent-crafted non-`.com` ideas; only check tool-generated candidates or a user-provided shortlist.
- For open-ended discovery without an explicit TLD, if the valid full-word hack pool is thin, say that directly and return a short list rather than filling space with junk.
- Do not use external `jq` trimming/ranking unless the user explicitly wants custom post-processing.
- Without `--mode`, `--tlds`, `--all`, or `--max-price`, the default is a mixed search: `.com` plus a curated whole-word domain-hack set.
- Use `--mode brandable` only with explicit source words; it does not fall back to the bundled dictionary and it emits `.com` candidates only in v1.
- Do not force availability with filler endings like `co` or `company`; prefer broader source words, explicit `--mode brandable`, or a deliberate shortlisted `check` pass.
- With `--limit`, mixed-mode `search` and mixed-shape `check` apply built-in soft balancing so the final shortlist keeps some traditional and some creative results when both are available.
- Only force `--mode exact`, `--tlds`, or `--mode hack` when the user directly specifies that constraint.
- Use `--mode exact` for traditional `.com` domains only.
- Use `--mode hack` for true whole-word domain hacks only. "Domain hack" is secondary jargon; do not require the user to say it.
- For mixed-mode responses, split the output into traditional exact results and domain hacks instead of blending everything into one list.
- Do not collapse a mixed run into mostly `.com` picks just because they feel safer or more standard unless the user asked for that preference.
- `check` accepts candidate JSON from `--input <path>` or `--input -`.
- `check` is the preferred path for a user-provided shortlist, or for deliberate `.com` brandable shortlists built from explicit source words.
- Use `--with-descriptions` only on final result sets.
- Bundled price data is dated and advisory; the tool should say it may now be out of date.
- The verification allowlist is the bundled IANA root-zone TLD snapshot, not the smaller pricing list.
- WHOIS checks can fall back to IANA RDAP bootstrap data for delegated TLDs that do not have custom local RDAP metadata. Bootstrap RDAP can confirm registered domains, but bootstrap 404/not-found responses are treated as inconclusive unless the TLD has curated local RDAP availability handling.
- Registration links prefer Cloudflare for TLDs in the bundled Cloudflare Registrar support snapshot, use Namecheap as the default fallback, and preserve dedicated registry links for TLDs that need them.
- Result JSON can include both preferred registrar fields and `direct_registration_url`; use `direct_registration_url` for clickable available-domain names because it is the per-domain action link.
- Pricing source and registration source are separate; do not assume price metadata implies registrar support.
- If no reliable bundled registration target is known, report that the registration link is unavailable rather than guessing.
- If a requested TLD is outside the delegated IANA root-zone set, fail closed and say the tool cannot verify that TLD.
- When supplying coined names, include your own short `description` if you have one.
