const fs = require('node:fs');

const KINDS = new Set(['word', 'name', 'acronym', 'phrase', 'coined', 'phonetic']);
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function list(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(x => typeof x !== 'string' || !x.trim())) throw new Error(`${name} must be an array of nonempty strings.`);
  return value.map(x => x.trim().toLowerCase());
}
function loadSourceContext(options = {}) {
  if (options.sourcesFile && (options.wordsFile || options.words)) throw new Error('Use sources-file or words-file/words, not both.');
  const source = options.sourcesFile ? readJson(options.sourcesFile) : options.sources;
  const entries = source == null ? [] : Array.isArray(source) ? source : source.words;
  if (!Array.isArray(entries)) throw new Error('Structured sources must be an array or an object with words.');
  const records = new Map();
  for (const entry of entries) {
    const item = typeof entry === 'string' ? { word: entry } : entry;
    if (!item || typeof item.word !== 'string' || !/^[a-z]+$/i.test(item.word)) throw new Error('Source word must contain ASCII letters only; use check for complete domains/IDNs.');
    const kind = item.kind || 'word';
    if (!KINDS.has(kind)) throw new Error(`Unknown source kind: ${kind}`);
    const priority = item.priority ?? 0;
    if (!Number.isFinite(priority) || priority < 0 || priority > 100) throw new Error('Source priority must be a number from 0 to 100.');
    if (item.commonness != null && (!Number.isFinite(item.commonness) || item.commonness < 0 || item.commonness > 1)) throw new Error('Source commonness must be a number from 0 to 1.');
    for (const key of ['rationale','theme']) if (item[key] != null && typeof item[key] !== 'string') throw new Error(`${key} must be text.`);
    const record = { word: item.word.toLowerCase(), kind, priority, commonness: item.commonness ?? null,
      rationale: item.rationale ?? null, theme: item.theme ?? null };
    if (records.has(record.word)) throw new Error(`Duplicate source word: ${record.word}`);
    records.set(record.word, record);
    for (const word of list(item.phonetic_alternatives, 'phonetic_alternatives')) {
      if (!/^[a-z]+$/.test(word)) throw new Error('Phonetic alternatives must contain ASCII letters only.');
      if (!records.has(word)) records.set(word, { ...record, word, kind: 'phonetic', alternative_of: record.word });
    }
  }
  const rawPreferences = options.preferencesFile ? readJson(options.preferencesFile) : options.preferences || {};
  const preferences = Object.fromEntries(['liked','rejected','avoid'].map(key => [key,list(rawPreferences[key],key)]));
  const minCommonness = options.minCommonness == null ? null : Number(options.minCommonness);
  if (minCommonness !== null && (!Number.isFinite(minCommonness) || minCommonness < 0 || minCommonness > 1)) throw new Error('min-commonness must be from 0 to 1.');
  if (minCommonness !== null && !records.size) throw new Error('min-commonness needs structured sources with explicit commonness ratings.');
  return { records, preferences, minCommonness };
}

function applySourceContext(candidates, context) {
  const { records, preferences, minCommonness } = context;
  return candidates.flatMap(candidate => {
    const sourceWords = candidate.source_words || [candidate.word];
    const sources = sourceWords.map(word => records.get(word)).filter(Boolean);
    const keys = [candidate.domain, candidate.word, candidate.label, ...sourceWords];
    if (preferences.rejected.some(x => keys.includes(x)) || preferences.avoid.some(x => candidate.label.includes(x))) return [];
    if (candidate.mode === 'hack' && sources.some(s => s.kind !== 'word')) return [];
    if (minCommonness !== null && (!sources.length || sources.some(s => s.commonness === null || s.commonness < minCommonness))) return [];
    const liked = preferences.liked.some(x => keys.includes(x));
    const boost = Math.max(0,...sources.map(s => s.priority)) * 10 + (liked ? 100 : 0);
    const natural = sources.length ? sources.every(s => s.kind === 'word') : candidate.candidate_type === 'real_word';
    return [{ ...candidate, candidate_type: natural && candidate.mode !== 'brandable' ? 'real_word' : 'brandable',
      ...(sources.length ? { sources, source_kind: sources.length === 1 ? sources[0].kind : 'blend',
        rationale: sources.map(s => s.rationale).filter(Boolean).join('; ') || null } : {}),
      score: candidate.score + boost, ranking_adjustment: boost,
      ranking_reasons: [...(liked ? ['explicitly liked'] : []), ...(boost - (liked ? 100 : 0) ? ['source priority'] : [])] }];
  // Stable tiers preserve existing label/TLD diversity among equal priorities.
  }).sort((a,b) => b.ranking_adjustment - a.ranking_adjustment);
}
module.exports = { loadSourceContext, applySourceContext };
