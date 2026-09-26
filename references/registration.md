# Registration evidence and eligibility

The CLI defaults to `--verification auto` (RDAP first, WHOIS fallback). `--verification rdap` uses HTTPS only and needs no system WHOIS command. `--verification whois-first` preserves the original ordering. Missing WHOIS no longer aborts a batch. A custom `DOMAIN_SEARCH_WHOIS_BIN` selects WHOIS-first unless overridden. `doctor` checks local prerequisites; `doctor --network` also probes IANA HTTPS, not TCP port 43.

Requests are serialized and spaced per RDAP host or WHOIS routing host/TLD, while unrelated registries can progress concurrently. UNKNOWN checks carry `unknown_reason` and `verification_source`; diagnose rather than immediately retrying the same batch.

`--tlds co.uk` generates full labels under an ICANN-section public suffix. The bundled Public Suffix List handles wildcard and exception rules. Its PRIVATE section is intentionally excluded: a hosting service's subdomains are not registrar inventory. Suffixes and subdomains return UNKNOWN with `not_registration_domain`, without network checks. The PSL describes boundaries, not whether a registry sells a name.

Supply `--profile profile.json` with `{"country":"US","entity":"individual"}`. Entity may also be `organization` or `government`; country means individual residence or an organization's registered office/main place of business, not nationality. Keep this file with the project. Do not infer a profile from the user's language or name.

Results contain separate `eligibility` evidence. Current reviewed coverage is deliberately limited to Afnic's six namespaces and .gov/.edu. `eligible` means the supplied profile passes the modeled criteria, not purchase clearance. Missing policies, missing profile facts, manual review requirements, and policies older than 180 days stay `unknown`. `--eligible-only` filters discovery to known passing rules, and can return very few names. It never suppresses user-provided checks.

To expand reviewed coverage, `--policies policies.json` accepts an array of overrides:

- `namespace`: ICANN public suffix, such as `co.uk`.
- `access`: `open`, `closed`, or `restricted`.
- `summary`, `source_url` (HTTPS authoritative policy), `verified_at` (ISO date).
- Optional `allowed_countries`, `entities`, `min_label_length`, `manual_review`.

Only model facts the source establishes. Complex nexus, citizenship alternatives, trademarks, local agents, documentation, exceptions, or registrar-specific rules need manual review rather than forcing them into a country allowlist. Both open/closed policy support and minimum-label filtering are available, but the bundled dataset makes no unverified comprehensive claim. Sessions embed the profile and reviewed rules so resumption does not require the original profile file.
