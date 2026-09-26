# AGENTS.md

Guidance for future automated updates:

- Commit and push after each self-contained chunk of work so updates are easy to review and recover.
- Treat the repository root as the installable Codex/Claude skill root. `SKILL.md` must stay at the top level.
- Keep `README.md` short, human-oriented, and focused on the agent skill, installation, and basic usage.
- Keep CLI-specific docs in `cli/README.md`; the CLI implementation is owned by `cli/`.
- Keep CLI behavior, root skill guidance, `agents/openai.yaml`, and `cli/README.md` aligned when commands or defaults change.
- Run `npm test` from `cli/` after implementation changes.

Domain-search behavior to preserve:

- Use `search` for open-ended domain discovery.
- Use `generate` only when an intermediate filtering step is needed.
- Use `check` for user-provided or deliberately curated shortlists. Validate syntax and delegation, but do not silently drop provided domains on taste grounds. Keep generated-name quality filtering in discovery.
- Without `--mode`, `--tlds`, `--tld-length`, or `--all`, preserve the mixed default (including when a price cap is set): traditional `.com` domains plus true whole-word domain hacks.
- Treat TLD-length or TLD-shape constraints as exact-domain searches unless the user explicitly asks for domain hacks. For example, "four-letter bird names with a two-letter TLD" means full labels like `ibis.xx`, not split hacks like `ib.is`.
- In mixed-mode responses, keep traditional exact domains and domain hacks visible as separate groups when both are available.
- For default discovery, domain hacks must read as one ordinary word across the dot. Do not pad weak result sets. Honor explicit requests for abbreviations, phrases, or brand shortlinks using deliberate shortlist checks.
- Use `--mode exact` for full labels under the requested TLDs; `.com` is its default.
- Use `--mode hack` for whole-word domain hacks only.
- Use `--mode brandable` only with explicit source words. It emits `.com` candidates only and should not force availability with filler endings like `co`, `company`, `corp`, `inc`, `llc`, or `ltd`.
- Use `--with-descriptions` only on final result sets.
- Bundled price data is advisory and static; update the dated metadata if pricing is refreshed.
- Registrar links prefer Cloudflare for TLDs in `cli/data/cloudflare-tlds.txt`, use Namecheap only where bundled metadata verifies support for that TLD, and preserve dedicated registry links for TLDs that need them.
- If no reliable bundled registration target exists, leave the registration link blank instead of guessing.
- TLDs with registrant eligibility requirements should be de-emphasized in broad searches and flagged with `registration_restriction` when shown.
- If a requested TLD is outside the delegated IANA root-zone set, fail closed rather than presenting an inconclusive result as available.

Skill notes:

- The launcher is `domain-search.sh`.
- The launcher resolves the real skill root and runs `cli/bin/domain-search.js`, so it works when the repo root is symlinked into a skills folder.
- When using the skill, call the launcher directly and inspect repository internals only if the launcher fails.
