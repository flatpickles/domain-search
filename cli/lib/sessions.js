const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validateDomain } = require('./whois');
const { loadEligibility } = require('./eligibility');
const { getRootTldVersion } = require('./tlds');

const TTL_HOURS = { AVAILABLE: 1, REGISTERED: 24, UNKNOWN: 1 / 12 };

function readRecords(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(data) ? data : data.checks;
  if (!Array.isArray(records)) throw new Error('Expected a session/result with checks or an array of timestamped checks.');
  for (const record of records) {
    validateDomain(record.domain);
    if (!(record.status in TTL_HOURS) || !Number.isFinite(Date.parse(record.checked_at))) {
      throw new Error('Each saved check needs domain, status, and checked_at.');
    }
  }
  return { data, records };
}

function freshDomains(records, freshnessHours, now = Date.now()) {
  if (freshnessHours != null && (!Number.isFinite(Number(freshnessHours)) || Number(freshnessHours) < 0)) {
    throw new Error('freshness-hours must be a non-negative number.');
  }
  const latest = new Map();
  for (const record of records) {
    const domain = validateDomain(record.domain);
    if (!latest.has(domain) || Date.parse(record.checked_at) > Date.parse(latest.get(domain).checked_at)) latest.set(domain, record);
  }
  return new Set([...latest].filter(([, r]) => {
    const age = now - Date.parse(r.checked_at);
    return age >= 0 && age < Number(freshnessHours ?? TTL_HOURS[r.status]) * 3600000;
  }).map(([domain]) => domain));
}

function atomicSave(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

// The frozen pool makes resuming independent of dictionary and ranking updates.
// Each completed lookup is checkpointed before optional descriptions are fetched.
async function runWithSession(command, options, paths = {}) {
  const { generateCandidates, checkCandidates, searchDomains } = require('./search');
  if (paths.session && paths.resume) throw new Error('Use --session for a new session or --resume for an existing one.');
  const file = paths.resume || paths.session;
  if (!file && !paths.excludeChecked) return command === 'search' ? searchDomains(options) : checkCandidates(options);
  let lock;
  let session;
  try {
    if (file) {
      lock = `${path.resolve(file)}.lock`;
      try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); }
      catch { lock = null; throw new Error('Session is locked by another run; remove its .lock only after verifying that run has stopped.'); }
    }
    if (paths.resume) {
      session = readRecords(paths.resume).data;
      if (session.schema_version !== 1 || session.command !== command || !Array.isArray(session.candidates)) {
        throw new Error('Incompatible session version or command. Resume using its original search/check command.');
      }
    } else {
      if (file && fs.existsSync(file)) throw new Error('Session already exists; use --resume or a new filename.');
      const generated = command === 'search' ? generateCandidates(options) : null;
      const candidates = generated?.candidates || options.candidates;
      // Fail before writing a session or making a lookup if any domain is invalid.
      const byDomain = new Map();
      for (const c of candidates) {
        const normalized = typeof c === 'string' ? { domain: c } : c;
        const domain = validateDomain(normalized.domain);
        if (!byDomain.has(domain)) byDomain.set(domain, { ...normalized, domain });
      }
      const queryKeys = new Set(['mode','tlds','tldLength','wordsFile','sourcesFile','preferencesFile','minWordLength','maxWordLength','minLabelLength','maxDomainLength','maxPrice','all','limit','maxChecks','concurrency','showAll','showUnknown','withDescriptions','progressFormat']);
      const query = Object.fromEntries(Object.entries(options).filter(([key]) => queryKeys.has(key)));
      const eligibility = loadEligibility(options);
      query.profile = eligibility.profile;
      query.policies = [...eligibility.rules.values()];
      session = { schema_version: 1, command, created_at: new Date().toISOString(), root_tld_version: getRootTldVersion(), query,
        generated: generated ? { ...generated, candidates: undefined } : null, candidates: [...byDomain.values()], checks: [] };
    }
    const records = [...session.checks, ...(paths.excludeChecked ? readRecords(paths.excludeChecked).records : [])];
    const excluded = freshDomains(records, paths.freshnessHours);
    const candidates = session.candidates.filter(c => !excluded.has(c.domain));
    const save = () => { if (file) atomicSave(file, { ...session, updated_at: new Date().toISOString() }); };
    save();
    const merged = { ...session.query, ...Object.fromEntries(Object.entries(options).filter(([,v]) => v !== undefined)), candidates,
      onCheck: async check => {
        session.checks = session.checks.filter(c => c.domain !== check.domain);
        session.checks.push(check);
        save();
        await options.onCheck?.(check);
      } };
    const summary = command === 'search'
      ? await searchDomains({ ...merged, generated: { ...session.generated, candidates, candidatePool: candidates.length, emitted: candidates.length } })
      : await checkCandidates(merged);
    summary.session = { path: file ? path.resolve(file) : null, pool: session.candidates.length,
      skipped_fresh: session.candidates.length - candidates.length, recorded: session.checks.length,
      freshness_hours: paths.freshnessHours ?? TTL_HOURS, root_tld_version: session.root_tld_version };
    return summary;
  } finally {
    if (lock) fs.unlinkSync(lock);
  }
}

module.exports = { TTL_HOURS, readRecords, freshDomains, atomicSave, runWithSession };
