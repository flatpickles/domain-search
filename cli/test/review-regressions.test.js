const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { generateCandidates, checkCandidates, searchDomains } = require('../lib/search');
const { getTldPricing } = require('../lib/pricing');
const { checkDomain, checkDomainViaRdap, classifyWhois } = require('../lib/whois');
const { generateExactCandidates, isWholeWordHack } = require('../lib/candidates');
const { fetchDescription } = require('../lib/descriptions');
const cli = path.join(__dirname, '../bin/domain-search.js');
const fakeWhois = path.join(__dirname, 'fixtures/whois');
const offline = { progressFormat: 'silent', checkDomainFn: async () => 'AVAILABLE' };

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', env: { ...process.env, DOMAIN_SEARCH_WHOIS_BIN: fakeWhois },
    stdio: ['pipe', 'pipe', 'pipe'],
  }));
}

test('explicit short source words survive exact generation, including two-letter labels', () => {
  const result = generateCandidates({ mode: 'exact', words: ['fp', 'ibis', 'swan'], tlds: 'me' });
  assert.deepEqual(new Set(result.candidates.map(x => x.domain)), new Set(['fp.me', 'ibis.me', 'swan.me']));
});

test('price caps keep mixed discovery and intersect explicit TLD and all scopes', () => {
  const mixed = generateCandidates({ words: ['appraise', 'sunrise'], maxPrice: 20 });
  assert.equal(mixed.mode, 'mixed');
  assert.ok(mixed.candidates.some(x => x.domain === 'sunrise.com'));
  assert.ok(mixed.candidates.some(x => x.domain === 'apprai.se'));
  assert.ok(mixed.candidates.every(x => x.domain_shape === 'creative_suffix' || x.tld === 'com'));
  assert.equal(generateCandidates({ words: ['sunrise'], tlds: 'com', maxPrice: 1 }).candidatePool, 0);
  const all = getTldPricing({ all: true, maxPrice: 20 });
  assert.ok(all.items.length > 0);
  assert.ok(all.items.every(x => x.annual_price_usd != null && x.annual_price_usd <= 20));
  assert.equal(generateCandidates({ words: ['sun', 'shine'], mode: 'brandable', maxPrice: 1 }).candidatePool, 0);
});

test('TLD length selects exact full labels and combines with price constraints', () => {
  const generated = generateCandidates({ words: ['ibis', 'swan'], tldLength: 2 });
  assert.equal(generated.mode, 'exact');
  assert.ok(generated.tlds.length > 100);
  assert.ok(generated.tlds.every(x => /^[a-z]{2}$/.test(x)));
  assert.ok(generated.candidates.every(x => ['ibis', 'swan'].includes(x.label)));
  const prices = getTldPricing({ tldLength: 2, maxPrice: 20 });
  assert.ok(prices.items.every(x => x.tld.length === 2 && x.annual_price_usd <= 20));
});

test('explicit domain length applies to exact and brandable candidates', () => {
  const exact = generateCandidates({ mode: 'exact', tlds: 'com', words: ['ibis', 'sunrise'], maxDomainLength: 8 });
  assert.deepEqual(exact.candidates.map(x => x.domain), ['ibis.com']);
  const brandable = generateCandidates({ mode: 'brandable', words: ['sun', 'sea', 'shine'], maxDomainLength: 10 });
  assert.ok(brandable.candidates.length > 0);
  assert.ok(brandable.candidates.every(x => x.domain.length <= 10));
});

test('ordinary words ending in corporate-looking letters are valid discovery names', () => {
  const generated = generateExactCandidates(['disco', 'zinc', 'taco', 'stageco'], { tlds: ['com'] });
  assert.deepEqual(new Set(generated.map(x => x.domain)), new Set(['disco.com', 'zinc.com', 'taco.com', 'stageco.com']));
});

test('check accepts digits, hyphens, IDNs and supplied names; normalizes and deduplicates before budgeting', async () => {
  const calls = [];
  const summary = await checkCandidates({
    ...offline, candidates: ['disco.com', 'zinc.com', 'my-app.com', 'fp2.com', 'café.com', 'DISCO.COM.', 'https://disco.com/'],
    checkDomainFn: async d => { calls.push(d); return 'AVAILABLE'; },
  });
  assert.deepEqual(new Set(calls), new Set(['disco.com', 'zinc.com', 'my-app.com', 'fp2.com', 'xn--caf-dma.com']));
  assert.equal(calls.length, 5);
  assert.equal(summary.candidatePool, 5);
  assert.equal(summary.checked, 5);
});

test('domain drives metadata even when input JSON carries inconsistent label/TLD fields', async () => {
  const x = await checkCandidates({ ...offline, candidates: [{ domain: 'DISCO.COM', label: 'wrong', tld: 'st' }] });
  assert.equal(x.results[0].tld, 'com');
  assert.equal(x.results[0].label, 'disco');
  assert.equal(x.results[0].registration_provider, 'Cloudflare');
});

test('invalid input fails before any lookup, including direct checkDomain API', async () => {
  let calls = 0;
  const checkDomainFn = async () => { calls++; return 'AVAILABLE'; };
  for (const input of ['-bad.com', 'bad_.com', 'foo..com', 'plainword', 'example.test', 'a'.repeat(64) + '.com', null]) {
    await assert.rejects(checkCandidates({ ...offline, candidates: ['valid.com', input], checkDomainFn }));
  }
  await assert.rejects(checkDomain('-h', { execFileFn: async () => { calls++; } }), /Invalid domain/);
  assert.equal(calls, 0);
});

test('all lookup statuses are preserved once, while ordinary discovery remains available-only', async () => {
  const options = { ...offline, candidates: ['available.com', 'taken.com', 'inconclusive.com'],
    checkDomainFn: async d => d === 'taken.com' ? 'REGISTERED' : d === 'inconclusive.com' ? 'UNKNOWN' : 'AVAILABLE' };
  const summary = await checkCandidates(options);
  assert.equal(summary.results.length, 1);
  assert.equal(summary.checks.length, 3);
  assert.deepEqual(new Set(summary.checks.map(x => x.status)), new Set(['AVAILABLE', 'REGISTERED', 'UNKNOWN']));
  assert.ok(summary.checks.every(x => Number.isFinite(Date.parse(x.checked_at))));
  assert.equal((await checkCandidates({ ...options, showAll: true })).results.length, 3);
});

test('check maxChecks reports honest partial coverage; limit only trims output', async () => {
  const options = { ...offline, candidates: ['one.com', 'two.com', 'three.com'], limit: 1 };
  assert.equal((await checkCandidates(options)).checked, 3);
  const bounded = await checkCandidates({ ...options, maxChecks: 1 });
  assert.equal(bounded.checked, 1);
  assert.equal(bounded.remaining_candidates, 2);
  assert.equal(bounded.stop_reason, 'max_checks');
  assert.equal(bounded.search_truncated, true);
});

test('search reports result-limit, budget, and exhaustion stops', async () => {
  const options = { ...offline, words: ['ibis', 'swan'], mode: 'exact', tlds: 'com' };
  assert.equal((await searchDomains({ ...options, limit: 1 })).stop_reason, 'result_limit');
  assert.equal((await searchDomains({ ...options, maxChecks: 1 })).stop_reason, 'max_checks');
  assert.equal((await searchDomains(options)).stop_reason, 'exhausted');
});

test('a declared joined word cannot disguise an invalid split', () => {
  assert.equal(isWholeWordHack({ label: 'steady', tld: 'st', joined_word: 'chemist' }), false);
});

test('custom wordlist hack candidates survive the generate/check handoff', async () => {
  const generated = generateCandidates({ mode: 'hack', tlds: 'st', words: ['novalyst'], trustSourceWordsForHackValidation: true });
  assert.equal(generated.candidatePool, 1);
  const checked = await checkCandidates({ ...offline, candidates: generated.candidates });
  assert.equal(checked.checked, 1);
  assert.equal(checked.results[0].domain, 'novaly.st');
});

test('WHOIS service failures never count as availability', () => {
  for (const raw of ['WHOIS server not found', 'Service not found', 'No whois server is available', 'Rate limit exceeded: not found']) {
    assert.equal(classifyWhois(raw), 'UNKNOWN', raw);
  }
});

test('queued RDAP requests get their own full timeout after reaching the queue head', async () => {
  const results = await Promise.all(['one.app', 'two.app', 'three.app'].map(domain => checkDomainViaRdap(domain, {
    rdapMinInterval: 35, rdapTimeout: 20,
    fetchFn: async (url, { signal }) => {
      signal.throwIfAborted();
      return { ok: true, status: 200, json: async () => ({ ldhName: domain }) };
    },
  })));
  assert.ok(results.every(x => x.status === 'REGISTERED'));
});

test('excessive RDAP Retry-After yields UNKNOWN without sleeping or retrying early', async () => {
  let calls = 0;
  const result = await checkDomainViaRdap('slow.app', { rdapMinInterval: 0,
    fetchFn: async () => { calls++; return { status: 429, ok: false, headers: { get: () => '3600' } }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'UNKNOWN');
});

test('description fetch has a deadline and bounded fallback', async () => {
  const started = Date.now();
  const result = await fetchDescription('word', { descriptionTimeout: 20,
    fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    }),
    execFileFn: async (cmd, args, options) => {
      assert.ok(args.includes('--max-time'));
      assert.ok(options.timeout < 2000);
      throw new Error('offline');
    },
  });
  assert.equal(result, null);
  assert.ok(Date.now() - started < 900);
});

test('CLI rejects misspelled flags, modes, missing values, and unintended positionals', () => {
  for (const args of [
    ['search', '--max-check', '2'], ['search', '--mode', 'excat'], ['check', 'x.com', '--format', 'yaml'],
    ['check', 'x.com', '--progress-format', 'verbose'], ['search', '--tlds', '--limit', '1'],
    ['search', 'ibis'], ['check', 'x.com', '--show-all=false'],
  ]) assert.throws(() => run(args));
});

test('CLI exposes complete direct-check statuses without repeated lookups', () => {
  const result = run(['check', 'example.com', 'disco.com', '--show-all', '--progress-format', 'silent']);
  assert.equal(result.results.length, 2);
  assert.ok(result.results.some(x => x.status === 'REGISTERED'));
  assert.equal(result.checks.length, 2);
});

test('CLI TLD length and supplied short words work through the public command', () => {
  const result = run(['check', 'fp', '--tld-length', '2', '--max-checks', '1', '--progress-format', 'silent']);
  assert.equal(result.checked, 1);
  assert.ok(result.results[0].domain.startsWith('fp.'));
  assert.equal(result.results[0].tld.length, 2);
});

test('invalid generation constraints fail clearly', () => {
  for (const options of [{ maxPrice: 'oops' }, { maxPrice: -1 }, { minWordLength: -1 }, { minWordLength: 5, maxWordLength: 3 }, { tldLength: 2.5 }, { maxDomainLength: 0 }, { mode: 'excat' }]) {
    assert.throws(() => generateCandidates({ words: ['sunrise'], ...options }));
  }
});


test('exhaustive TLD scopes retain restricted candidates and alternate supplied labels', () => {
  const birds = generateCandidates({ words: ['ibis', 'swan', 'wren', 'tern'], tldLength: 2 });
  assert.equal(birds.candidatePool, 4 * birds.tlds.length);
  assert.ok(birds.candidates.some(x => x.tld === 're' && x.tld_score_adjustment < 0));
  const shortlinks = generateCandidates({ words: ['fp', 'flat'], all: true });
  assert.equal(shortlinks.candidatePool, 2 * shortlinks.tlds.length);
  assert.deepEqual(new Set(shortlinks.candidates.slice(0, 2).map(x => x.label)), new Set(['fp', 'flat']));
});

test('CLI --help succeeds without selecting a command', () => {
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /Usage:/);
});

test('curated RDAP availability needs an RDAP not-found body, not a generic HTTP 404 page', async () => {
  for (const json of [async () => { throw new Error('HTML response'); }, async () => ({ message: 'service not found' })]) {
    const result = await checkDomainViaRdap('missing.app', { rdapMinInterval: 0,
      fetchFn: async () => ({ status: 404, ok: false, json }),
    });
    assert.equal(result.status, 'UNKNOWN');
  }
});

test('a price cap does not broaden explicit exact mode beyond its default .com', () => {
  const result = generateCandidates({ mode: 'exact', words: ['sunrise'], maxPrice: 30 });
  assert.deepEqual(result.tlds, ['com']);
});

test('CLI bare-name sweeps preserve generated label fairness through check', () => {
  const result = run(['check', 'fp', 'flat', '--all', '--max-checks', '2', '--progress-format', 'silent']);
  assert.deepEqual(new Set(result.checks.map(x => x.domain.split('.')[0])), new Set(['fp', 'flat']));
});
