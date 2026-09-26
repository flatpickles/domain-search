# Data maintenance and packaging

`node scripts/refresh-data.js iana` and `node scripts/refresh-data.js psl` fetch official snapshots with deadlines, validate their structure, and print an added/removed-line preview. Add `--apply` to replace the bundled snapshot and record its hash, source, and refresh time in `cli/data/provenance.json`. IANA describes delegation; the PSL describes suffix boundaries. Neither is a list of domains available for purchase. PSL fetching should be infrequent (the publisher updates it daily).

For curated data, prepare a reviewed import and preview it:

```sh
node scripts/refresh-data.js pricing --input reviewed-prices.json
node scripts/refresh-data.js registrars --input reviewed-support.json
node scripts/refresh-data.js eligibility --input reviewed-policies.json
node scripts/refresh-data.js cloudflare --input reviewed-cloudflare-tlds.txt
```

Apply with `--apply` after reviewing the diff. Pricing merges only price fields; registrar imports merge only registration-support fields, preserving unrelated data. Eligibility and Cloudflare snapshots replace the corresponding file. Per-record HTTPS sources and observation dates are required; the Cloudflare text list uses `# Source:` and `# Verified:` headers. Imports establish provenance, not truth: verify against the primary registry/registrar source before applying. Existing price fields use `annual_price_usd`, `price_updated_at`, `price_source_name`, `price_source_url`; they remain advisory TLD estimates. Never substitute a first-year sale for a renewal quote. Registrar entries require sourced, dated `registration_options`. Run `npm --prefix cli test` after changes.

Build a distributable skill archive with `node scripts/package-skill.js` (Node 22+, no npm dependencies). The archive in `dist/domain-search.zip` includes a SHA-256 manifest, skill instructions, references, CLI, and bundled data. It excludes Git history, tests, temporary output, and local sessions. The builder rejects symlinks and uses an explicit allowlist. Rebuild after changes; do not hand-maintain a second copy of the skill.

The extracted skill runs with Node 22 and network access. WHOIS is optional; HTTPS-only hosts can use RDAP with incomplete registry coverage. Sessions are ordinary JSON files: retain/download them to resume across ephemeral environments. This package requires no hosted backend or OpenAI API key. Import/execution support depends on the agent host; packaging alone does not verify a particular cloud account's runtime or network policy.
