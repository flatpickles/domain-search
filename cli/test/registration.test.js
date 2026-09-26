const test=require('node:test');
const assert=require('node:assert/strict');
const {domainParts,isPublicNamespace}=require('../lib/namespaces');
const {checkDomain}=require('../lib/whois');
const {generateCandidates,checkCandidates}=require('../lib/search');
const {assessEligibility,loadEligibility}=require('../lib/eligibility');
const {schedule}=require('../lib/scheduler');
test('PSL boundaries handle multi-label, wildcards, exceptions and private services',()=>{
 assert.equal(domainParts('notes.co.uk').registrable,'notes.co.uk');
 assert.equal(domainParts('www.notes.co.uk').is_registration_domain,false);
 assert.equal(domainParts('co.uk').registrable,null);
 assert.equal(domainParts('a.b.ck').namespace,'b.ck');
 assert.equal(domainParts('www.ck').namespace,'ck');
 assert.equal(domainParts('my.github.io').registrable,'github.io');
 assert.equal(isPublicNamespace('co.uk'),true);assert.equal(isPublicNamespace('example.com'),false);
});
test('exact discovery accepts public second-level namespaces and preserves price uncertainty',async()=>{
 const x=generateCandidates({words:['notes'],tlds:'co.uk'});
 assert.equal(x.candidates[0].domain,'notes.co.uk');
 const y=await checkCandidates({candidates:x.candidates,checkDomainFn:async()=> 'AVAILABLE',progressFormat:'silent'});
 assert.equal(y.results[0].registration_namespace,'co.uk');
 assert.equal(y.results[0].price,null);
});
test('subdomains and suffixes never become purchasable through WHOIS not-found',async()=>{
 for(const domain of ['www.notes.com','co.uk']) {
  const x=await checkDomain(domain,{execFileFn:async()=>{throw new Error('Must not run');}});
  assert.equal(x.status,'UNKNOWN'); assert.equal(x.unknown_reason,'not_registration_domain');
 }
});
test('RDAP works without WHOIS and records typed evidence',async()=>{
 const x=await checkDomain('test.app',{verification:'auto',rdapMinInterval:0,execFileFn:async()=>{throw new Error('Must not run');},fetchFn:async()=>({ok:true,status:200,json:async()=>({ldhName:'test.app'})})});
 assert.equal(x.status,'REGISTERED');assert.equal(x.verification_source,'rdap');
 const y=await checkDomain('test.app',{rdapMinInterval:0,rdapRetries:1,execFileFn:async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});},fetchFn:async()=>({ok:false,status:429})});
 assert.equal(y.status,'UNKNOWN'); assert.equal(y.unknown_reason,'rate_limited');
});
test('reviewed eligibility separates profile mismatch, unknown policy, and manual review',()=>{
 const us=loadEligibility({profile:{country:'US',entity:'individual'}});
 const fr=loadEligibility({profile:{country:'FR',entity:'individual'}});
 assert.equal(assessEligibility('notes.re',us).status,'ineligible');
 assert.equal(assessEligibility('notes.re',fr).status,'eligible');
 assert.equal(assessEligibility('notes.app',fr).status,'unknown');
 assert.equal(assessEligibility('notes.edu',us).status,'ineligible');
 const x=generateCandidates({words:['notes'],tlds:'re,com',profile:fr.profile,eligibleOnly:true});
 assert.deepEqual(x.candidates.map(c=>c.domain),['notes.re']);
});
test('registry queues serialize one host without blocking unrelated hosts',async()=>{
 let release;const held=new Promise(r=>release=r);const order=[];
 const first=schedule('fixture-a',async()=>{order.push('first');await held;});
 const second=schedule('fixture-a',async()=>order.push('second'));
 await schedule('fixture-b',async()=>order.push('other'));
 assert.deepEqual(order,['first','other']);release();await Promise.all([first,second]);assert.equal(order.at(-1),'second');
});
