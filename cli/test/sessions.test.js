const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runWithSession, freshDomains } = require('../lib/sessions');
const offline = { progressFormat: 'silent', checkDomainFn: async () => 'AVAILABLE' };
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-session-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'session.json');
}
test('sessions freeze candidates, skip fresh work, and allow explicit refresh', async t => {
  const file = fixture(t);
  const first = await runWithSession('search', { ...offline, words: ['ibis','swan','wren'], tlds:'com', maxChecks:1 }, {session:file});
  assert.equal(first.checked,1);
  const second = await runWithSession('search', { ...offline, maxChecks:3 }, {resume:file});
  assert.equal(second.checked,2);
  assert.equal(second.session.skipped_fresh,1);
  assert.equal(new Set([...first.checks,...second.checks].map(c=>c.domain)).size,3);
  assert.equal((await runWithSession('search', offline, {resume:file})).checked,0);
  assert.equal((await runWithSession('search', {...offline,maxChecks:3}, {resume:file,freshnessHours:0})).checked,3);
});
test('completed checks survive an interrupted batch, and locks are released', async t => {
  const file = fixture(t);
  let calls = 0;
  await assert.rejects(runWithSession('check', {...offline,concurrency:1,candidates:['one.com','two.com'],checkDomainFn:async()=>{
    if (++calls===2) throw new Error('interrupted'); return 'REGISTERED';
  }}, {session:file}), /interrupted/);
  assert.equal(JSON.parse(fs.readFileSync(file)).checks.length,1);
  assert.ok(!fs.existsSync(`${file}.lock`));
  assert.equal((await runWithSession('check', offline, {resume:file})).checked,1);
});
test('session creation does not overwrite existing files and rejects incompatible resumes', async t => {
  const file=fixture(t);
  await runWithSession('check',{...offline,candidates:['one.com']},{session:file});
  const saved=fs.readFileSync(file,'utf8');
  await assert.rejects(runWithSession('check',{...offline,candidates:['two.com']},{session:file}),/already exists/);
  assert.equal(fs.readFileSync(file,'utf8'),saved);
  await assert.rejects(runWithSession('search',offline,{resume:file}),/Incompatible/);
});
test('status-specific TTLs recheck unknowns quickly, never trust future dates', () => {
  const now=Date.now();
  const records=['AVAILABLE','REGISTERED','UNKNOWN'].map((status,i)=>({domain:`test${i}.com`,status,checked_at:new Date(now-3600000*2).toISOString()}));
  assert.deepEqual([...freshDomains(records,undefined,now)],['test1.com']);
  assert.equal(freshDomains(records,0,now).size,0);
  assert.throws(()=>freshDomains(records,-1),/non-negative/);
  assert.equal(freshDomains([{...records[0],checked_at:new Date(now+1000).toISOString()}],24,now).size,0);
});
test('cross-run exclusions honor freshness and retain complete status records',async t=>{
  const file=fixture(t);
  await runWithSession('check',{...offline,candidates:['one.com'],showAll:true},{session:file});
  const next=await runWithSession('check',{...offline,candidates:['ONE.COM','two.com']},{excludeChecked:file});
  assert.deepEqual(next.checks.map(c=>c.domain),['two.com']);
});
test('portable sessions retain explicit preferences, even rejected names absent from pool',async t=>{
 const file=fixture(t);const prefs=path.join(path.dirname(file),'preferences.json');
 fs.writeFileSync(prefs,JSON.stringify({liked:['ibis'],rejected:['swan'],avoid:['tune']}));
 await runWithSession('search',{...offline,words:['ibis','swan'],tlds:'com',preferencesFile:prefs},{session:file});
 fs.unlinkSync(prefs);
 const saved=JSON.parse(fs.readFileSync(file));
 assert.deepEqual(saved.source_context.preferences,{liked:['ibis'],rejected:['swan'],avoid:['tune']});
 assert.equal((await runWithSession('search',offline,{resume:file})).checked,0);
});
test('CLI refuses to overwrite its resumable session with formatted output',t=>{
 const file=fixture(t);const {execFileSync}=require('node:child_process');
 assert.throws(()=>execFileSync(process.execPath,[path.join(__dirname,'../bin/domain-search.js'),'check','one.com','--session',file,'--output',file],{stdio:'pipe'}),/different files/);
 assert.equal(fs.existsSync(file),false);
});
