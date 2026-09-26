# Naming inputs and preferences

Use `--sources-file sources.json` instead of `--words-file` when meaning, priority, or spelling kind matters. Sources are an array (or `{ "words": [...] }`):

```json
[
  {"word":"cadence","kind":"word","rationale":"Rhythm and flow","theme":"music","priority":8,"commonness":0.9},
  {"word":"nt","kind":"acronym","rationale":"Compact notes shortlink","priority":5},
  {"word":"notemark","kind":"coined","phonetic_alternatives":["notemarc"]}
]
```

Kinds: `word`, `name`, `acronym`, `phrase`, `coined`, `phonetic`. Generation tokens use ASCII letters; use `check` for full domains, hyphens, digits, and IDNs. Only word sources produce discovery hacks. Other kinds remain valid exact names. Phonetic alternatives are used only when explicitly supplied. Generated blends retain both source records.

Priority is 0–100 (default 0); each point adds 10 to the heuristic score. Commonness is an optional **author-supplied judgment**, 0–1, not measured corpus frequency. `--min-commonness 0.7` excludes unrated sources too. No hidden frequency data is inferred.

`--preferences-file preferences.json` accepts:

```json
{"liked":["cadence"],"rejected":["notemark.app"],"avoid":["tune"]}
```

Liked names receive a 100-point boost on exact source/name/domain matches. Rejected exact sources/names/domains are removed from discovery; `avoid` removes labels containing a fragment. Carry the user's explicit feedback into this file; do not infer blanket bans from a single rejection. Constraints apply only to generation, never silently dropping direct checks. Equal preference tiers preserve existing label/TLD diversity. Ranking is spelling heuristics plus explicit preferences, not semantic judgment. Session candidates freeze their source metadata and preferences; use a new pool to change them.
