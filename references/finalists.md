# Finalist research and comparisons

Keep registration status, registrar quotes, registrant eligibility, and product-name research as separate evidence. Missing evidence stays unknown.

## Registrar confirmation

`./domain-search.sh confirm melodybook.app musicnotes.com --output quotes.json` queries Porkbun's documented **checkDomain** endpoint for up to 25 finalists. It returns domain-specific buyability, premium flag, registration price per year, renewal price, minimum years, and observation date when the response provides them. A quote is not a completed checkout or guaranteed minimum-term total; promotions, taxes, or policy requirements may change the purchase outcome.

Set `PORKBUN_API_KEY` and `PORKBUN_SECRET_API_KEY` through the host's secret/environment mechanism. Do not put keys in prompts, command arguments, source files, or sessions. Without keys the command reports `credentials_required` without making a request. It never registers, renews, funds, or changes domains. Account-wide rate/auth failures stop the remaining batch; correct the cause rather than retrying indiscriminately. Sandbox/mock responses are not purchase evidence.

If the user uses another registrar or credentials are unavailable, use their available browser/connector to inspect the finalists' actual search or checkout pages. Record provider, domain, buyability, premium, registration/renewal prices, minimum term, currency, source URL, and timestamp; leave any absent field unknown. Cloudflare support links are not an API quote. Do not claim automatic confirmation for an unimplemented provider.

Source/API contract: https://porkbun.com/api/json/v3/documentation (reviewed 2026-09-26).

## App Store and product overlap

`./domain-search.sh collisions "Melody Book" "Note Mark" --country US --output collisions.json` queries Apple's software search, at most 20 names per run, spaced below the documented approximate 20 calls/minute. Results distinguish normalized exact-title matches from related search results, with developer, storefront, URL, and date. Failure stays unknown. No exact title in returned results is not proof that a name is unused; results are limited, region-specific, and do not exhaust all Apple platforms.

For broader product overlap, use available web research: search the exact name plus the product category, inspect primary product pages, and record the product, owner, category, URL, match strength, and observation date. Compare actual purpose and audience. Keep unrelated exact-name uses distinct from a competing product. This is naming research, not trademark clearance. Do not silently run collision research for ordinary domain-only requests.

Source/API contract: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html.

## Portable comparison

`./domain-search.sh export --input results.json --format csv --output comparison.csv` also accepts a session file, including checked, unattempted, and previously hidden statuses. JSON and Markdown output are available. `--evidence quotes.json` joins registrar findings by domain; an evidence file can also contain an array of confirm/collisions documents. App titles join by normalized source word/label, so inspect coined/multiword mappings before presenting them. CSV protects text cells against formula execution. Fields retain evidence dates; old results are not refreshed by export.
