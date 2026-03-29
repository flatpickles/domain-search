---
name: domain-search
description: Use when you need to search dictionary-driven domain candidates, including domain hacks that use the TLD as part of the word and exact domains across TLDs like .com, .net, and .org.
---

# Domain Search

Use this skill when the user wants domain ideas, availability checks, domain hacks, or exact-TLD scans based on real words.

## Workflow

1. Decide whether the request is a `hack`, `exact`, or `check` task.
2. Ask for or infer the target TLDs.
3. Run the packaged CLI from the same checkout as this skill:

```bash
node bin/domain-search.js hack --tlds st,re,se,it --limit 20
node bin/domain-search.js exact --tlds com,net,org --limit 20
node bin/domain-search.js check chemi.st example.com
```

If you are already in the `skill/` directory of the cloned repo, the same commands can be run as `node ../bin/domain-search.js ...`.

4. Prefer `--format json` if you need to post-process or rank results.
5. For faster local-only scans, set `DOMAIN_SEARCH_DISABLE_DEFINITIONS=1`.

## Notes

- `hack` mode splits the word into label plus TLD.
- `exact` mode checks the full word against each requested TLD.
- The bundled fallback wordlist can be overridden with `--words-file`.
- Availability relies on `whois`, and registry behavior varies by TLD.
