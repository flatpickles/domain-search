# AGENTS.md

Guidance for future automated updates:

- Commit and push after each self-contained chunk of work so updates are easy to review and recover.
- Keep `README.md` short, human-oriented, and focused on what the tool does, GitHub-based installation, and basic usage.
- Keep detailed agent workflow guidance here and in `skill/SKILL.md`, not in the human README.
- Keep CLI behavior, `README.md`, and `skill/SKILL.md` aligned when commands or defaults change.
- Run `npm test` after implementation changes.

Domain-search behavior to preserve:

- Use `search` for open-ended domain discovery.
- Use `generate` only when an intermediate filtering step is needed.
- Use `check` for user-provided or deliberately curated shortlists.
- Without `--mode` or `--tlds`, preserve the mixed default: traditional `.com` domains plus true whole-word domain hacks.
- In mixed-mode responses, keep traditional exact domains and domain hacks visible as separate groups when both are available.
- Treat a domain hack as valid only when the label plus TLD reads as one ordinary word. Do not pad weak result sets with phrase-like hacks, arbitrary suffix domains, or coined non-`.com` alternatives.
- Use `--mode exact` for traditional `.com` domains only.
- Use `--mode hack` for whole-word domain hacks only.
- Use `--mode brandable` only with explicit source words. It emits `.com` candidates only and should not force availability with filler endings like `co`, `company`, `corp`, `inc`, `llc`, or `ltd`.
- Use `--with-descriptions` only on final result sets.
- Bundled price data is advisory and static; update the dated metadata if pricing is refreshed.
- If no reliable bundled registration target exists, leave the registration link blank instead of guessing.
- If a requested TLD is outside the supported verification set, fail closed rather than presenting an inconclusive result as available.

Skill notes:

- The launcher is `skill/scripts/domain-search.sh`.
- The skill root is `skill/`, not the repository root. User-facing docs should tell people to clone the repo somewhere stable and symlink `skill/` into their global Codex or Claude skills folder.
- When using the skill, call the launcher directly and inspect repository internals only if the launcher fails.
- Keep `skill/examples/brandable-shortlist.json` aligned with the structured shortlist contract if that contract changes.
