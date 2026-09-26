# domain-search CLI

Generate and check domain names with WHOIS/RDAP availability, dated TLD price estimates, and registrar links. Node.js 22+, `whois`, and network access are needed for live checks. Offline generation and pricing need only Node.js.

From a clone of [flatpickles/domain-search](https://github.com/flatpickles/domain-search):

```bash
cd cli
npm install -g .
domain-search --help
```

Or run `./domain-search.sh` from the repository root; the launcher also works via an absolute path from another directory. The repository root is the installable agent skill; the npm package is in `cli/`.

## Commands

```bash
domain-search search --words-file words.txt --limit 20 --max-checks 480 --output results.json
domain-search generate --mode hack --words-file words.txt --limit 100
domain-search check example.com example.app --show-all
domain-search check --input shortlist.json --max-checks 100
domain-search prices --tlds com,app --max-price 30
```

- `search`: generate and check ranked candidates, stopping at the available-result target, check budget, or end of the pool.
- `generate`: generate candidates without availability checks. `--limit` limits emitted candidates.
- `check`: verify supplied domains, newline text, candidate JSON, or bare names expanded using the generation options. Taste filters do not discard supplied domains; invalid domains and undelegated TLDs fail before checking. Normalized duplicates are checked once, retaining the first entry's metadata.
- `prices`: inspect bundled TLD metadata. These are estimates, not current registrar quotes or domain-specific premiums.

Without `--mode`, `--tlds`, `--tld-length`, or `--all`, discovery mixes exact `.com` names and whole-word hacks. A price cap only filters the chosen scope. Explicit `--tlds`, `--tld-length`, and `--all` imply exact mode unless another mode is specified.

| Option | Meaning |
| --- | --- |
| `--mode mixed` | Exact `.com` plus a curated whole-word hack set |
| `--mode exact` | Full labels under selected TLDs, default `.com` |
| `--mode hack` | Split words across the dot; accepts colloquial `-ing` → `.in` |
| `--mode brandable` | Blend explicit 3–8-letter source tokens into 6–10-letter `.com` labels; at most 200 source words |
| `--tlds com,net` | Explicit TLD scope |
| `--tld-length 2` | Delegated ASCII TLDs of exactly this length |
| `--all` | Every TLD in the bundled IANA root-zone snapshot; includes restricted/closed TLDs |
| `--max-price 30` | Intersect the TLD scope with known bundled prices at/below this amount; unknown prices are excluded |
| `--words-file path` | Newline-separated source words; `-` reads stdin |
| `--input path` | `check` input: domains or JSON array / `candidates` / `results`; `-` reads stdin |
| `--min-word-length`, `--max-word-length` | Source-word length bounds: supplied words default to 1–63, dictionary to 5–10 |
| `--min-label-length` | Minimum pre-dot label length: supplied words default to 1, dictionary to 3 |
| `--max-domain-length` | Maximum entire domain length including dots/TLD; hacks default to 10, exact/brandable have no additional default cap |
| `--limit N` | Result target for `search`; output cap only for `check` |
| `--max-checks N` | Maximum distinct domains checked; each may use WHOIS and RDAP fallback |
| `--concurrency N` | Concurrent domain checks, default 4; RDAP is paced separately |
| `--show-all` | Include registered and unknown domains in displayed results |
| `--show-unknown` | Include inconclusive results; ordinary discovery is available-only |
| `--with-descriptions` | Fetch bounded-time definitions for available real-word candidates; preserve supplied descriptions |
| `--progress-format human\|jsonl\|silent` | Progress on stderr, default human |
| `--format json\|markdown` | Output format, default JSON |
| `--output path` | Save the output payload instead of printing it |

TLD and word constraints are generation options; for a concrete supplied domain shortlist, `check` checks those domains as given. `--tld-length` also works with `prices`. Legacy `hack`, `exact`, and `brandable` commands alias `search --mode ...`; `--with-definitions` aliases `--with-descriptions`.

## Precise and exhaustive searches

```bash
domain-search search --mode exact --tld-length 2 --words-file birds.txt --min-word-length 4 --max-word-length 4 --max-checks 2000
domain-search search --mode exact --tlds app --words-file names.txt --limit 20 --max-checks 400
domain-search generate --mode exact --all --words-file shortlinks.txt
```

TLD shape preserves the entire label: `ibis.xx`, not `ib.is`. Multiple source labels alternate during exact TLD sweeps. Known registrant restrictions lower ranking; they do not silently remove TLDs from the pool. Missing restriction metadata is not proof of eligibility. Generation still uses spelling heuristics and source-word filters; inspect its candidate pool before claiming exhaustive coverage.

`search` uses a bounded budget by default: mixed searches use `max(limit × 24, 240)`, other modes `max(limit × 20, 200)`. Without a limit, budget planning uses 20 but there is no result-count stop. For an exhaustive pass, omit `--limit` and set `--max-checks` to cover the generated pool. `check` checks its entire unique shortlist unless `--max-checks` is set; `--limit` trims output only.

## Reading results

JSON `checks` records every checked domain with `status` and `checked_at`, even when filtered out of `results`. This lets callers answer “which were taken?” without repeating network work. `results` contains enriched candidates selected for display. `checked`, `candidatePool`, `remaining_candidates`, `search_truncated`, `max_checks_applied`, and `stop_reason` describe coverage. Stop reasons are `result_limit`, `max_checks`, and `exhausted`.

`AVAILABLE` means positive WHOIS/curated RDAP evidence. It does not guarantee a registrar will sell the name at the bundled price. Generic bootstrap RDAP not-found responses remain `UNKNOWN`; registered records must match the queried domain. Network failures, rate limits, and unrecognized responses are inconclusive. Availability changes: use timestamps when reading saved checks.

Registrar metadata prefers Cloudflare where supported, uses Namecheap only with bundled support evidence, and otherwise retains known registry links. `direct_registration_url` is the per-domain action link when available. `registration_restriction` describes known registrant eligibility requirements. Prices, registrar support, and restrictions are independent metadata; root-zone delegation alone establishes none of them.

## Library and tests

```js
const { generateCandidates, searchDomains, checkCandidates, checkDomain,
  getTldPricing, formatResults, fetchDescription } = require('domain-search');

const summary = await checkCandidates({
  candidates: ['example.com', 'example.app'],
  showAll: true,
  maxChecks: 2,
  progressFormat: 'silent',
});
```

Library options use camelCase (`tldLength`, `maxPrice`, `maxChecks`, `showAll`). `generateCandidates` accepts `words: [...]` and `emitLimit`. Generated `real_word` metadata means wordlist-derived; it is not a guarantee that an explicitly supplied token is a dictionary word. The lower-level exact/hack/brandable generators are also exported.

Run `npm test` from `cli/`, or `npm --prefix cli test` from the repository root. Automated availability tests use fixtures or injected lookups rather than live registry status.

## Portable sessions

Use `search --session ./naming.session.json ...` or `check --session ./shortlist.session.json ...` to save the full pool, query settings, and timestamped checks. Each completed lookup is checkpointed atomically. Session files are private local artifacts; keep them outside the installed skill/repository.

Continue with `search --resume ./naming.session.json --limit 20 --max-checks 480`. The limit and budget apply to this run, and results contain newly checked names. Resume freezes the original pool; start a new session for new words or constraints. `--exclude-checked previous.json` also skips fresh checks from a different session or result.

Default freshness: AVAILABLE 1 hour, REGISTERED 24 hours, UNKNOWN 5 minutes. `--freshness-hours N` overrides all three; `0` forces rechecking. Skipped results are never relabeled as newly verified. Keep/download the JSON file to carry a session between machines or temporary workspaces. Concurrent writers are blocked by a `.lock`; after an abrupt process kill, verify it has stopped before removing that lock.

## Structured naming inputs

`--sources-file` accepts typed sources with rationale, priority, theme, explicit commonness, and phonetic alternatives. `--preferences-file` preserves likes/rejections; `--min-commonness` filters supplied ratings. See [the naming input schema](../references/naming-inputs.md). Plain newline word files remain supported.
