# Domain Search

A self-contained agent skill for finding and checking domain names: exact names, whole-word domain hacks, and deliberately supplied brand spellings. The agent handles meaning and taste; the bundled CLI checks registration evidence and preserves dated results.

Install from GitHub in an agent host that supports repository-based skills:

```text
https://github.com/flatpickles/domain-search
```

Or clone into your local skills folder:

```sh
git clone https://github.com/flatpickles/domain-search.git ~/.codex/skills/domain-search
```

The repository root is the skill root. For Claude, use `~/.claude/skills/domain-search`. You can also symlink an existing checkout into your agent's skills folder.

Try: “Use domain-search to find short names for a musical notebook on .app. Keep the naming rationale and save a session so we can continue later.”

The skill supports:

- Mixed `.com` and whole-word hacks, exact TLD/length constraints, and shortlink shortlists.
- Structured source words, likes/rejections, priorities, and portable resumable sessions.
- RDAP/WHOIS evidence, public-suffix boundaries, and partial sourced eligibility rules.
- Optional registrar quotes, App Store title research, and CSV/Markdown comparisons.

**Requirements:** Node.js 22+ and network access for live checks. No npm dependencies or hosted service. WHOIS is optional; HTTPS-only environments can use `--verification rdap`, with incomplete registry coverage. Run `./domain-search.sh doctor` to check setup.

Bundled prices are dated TLD estimates, not live quotes. Domain registration evidence, registrant eligibility, registrar buyability, and product-name overlap are separate checks. Optional Porkbun quotes require environment credentials; ordinary domain checks do not.

To share a packaged skill, build from the repository:

```sh
node scripts/package-skill.js
```

This creates `dist/domain-search.zip` with bundled code/data and a checksum manifest, excluding sessions and Git history. Extract it and select the `domain-search` folder in hosts that accept local skills, or import the ZIP where supported. Cloud execution still depends on the host's Node/network support; save session JSON files before leaving an ephemeral workspace.

See [CLI usage](cli/README.md), [finalist research](references/finalists.md), and [data maintenance](references/maintenance.md).
