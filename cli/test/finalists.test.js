const test=require('node:test');
const assert=require('node:assert/strict');
const {confirmDomains,checkCollisions}=require('../lib/finalists');
const {exportComparison}=require('../lib/export');
const {validateMetadata}=require('../../scripts/refresh-data');
const fixture={status:'SUCCESS',response:{avail:'yes',price:'9.73',premium:'no',firstYearPromo:'yes',minDuration:1,additional:{renewal:{price:'12.00'}}}};
test('registrar confirmation preserves distinct domain prices and only calls check endpoint',async()=>{
 const x=await confirmDomains(['example.com'],{apiKey:'test-key',secretKey:'test-secret',intervalMs:0,fetchFn:async(url,options)=>{
  assert.equal(url,'https://api.porkbun.com/api/json/v3/domain/checkDomain/example.com');assert.equal(options.redirect,'error');
  assert.equal(JSON.parse(options.body).apikey,'test-key');return {ok:true,status:200,json:async()=>fixture};
 }});
 const e=x.results[0].registrar_confirmation;assert.equal(e.available,true);assert.equal(e.registration_price_usd,9.73);assert.equal(e.renewal_price_usd,12);assert.equal(e.premium,false);
 assert.ok(!JSON.stringify(x).includes('test-secret'));
});
test('registrar rate limits stop the batch without retries or guessed quotes',async()=>{
 let calls=0;const x=await confirmDomains(['one.com','two.com'],{apiKey:'k',secretKey:'s',intervalMs:0,fetchFn:async()=>{calls++;return{ok:false,status:429,json:async()=>({status:'ERROR'})};}});
 assert.equal(calls,1);assert.equal(x.results[1].registrar_confirmation.reason,'batch_stopped');assert.equal(x.results[0].registrar_confirmation.available,null);
});
test('missing or mock registrar fields stay unknown',async()=>{
 for(const data of [{status:'SUCCESS',response:{}},{...fixture,sandbox:true}]){
 const x=await confirmDomains(['one.com'],{apiKey:'k',secretKey:'s',intervalMs:0,fetchFn:async()=>({ok:true,status:200,json:async()=>data})});
 assert.equal(x.results[0].registrar_confirmation.available,null);
 }
});
test('App Store collisions distinguish exact normalized names from related search results',async()=>{
 const x=await checkCollisions(['Note Mark'],{country:'GB',intervalMs:0,fetchFn:async url=>{
  assert.equal(new URL(url).searchParams.get('country'),'GB');return{ok:true,json:async()=>({results:[{trackName:'NoteMark',sellerName:'Example',trackViewUrl:'https://apps.apple.com/test'},{trackName:'Other Notes'}]})};
 }});
 assert.equal(x.results[0].conclusion,'exact_title_found');assert.equal(x.results[0].matches[1].match_type,'related_search_result');
 const y=await checkCollisions(['No Result'],{intervalMs:0,fetchFn:async()=>{throw new Error('offline');}});assert.equal(y.results[0].status,'unknown');
});
test('comparison merges independent evidence and protects spreadsheet cells',()=>{
 const csv=exportComparison({results:[{domain:'one.com',description:'=HYPERLINK("bad")',status:'AVAILABLE',checked_at:'2026-09-26'}]},{format:'csv',evidence:{results:[{domain:'one.com',registrar_confirmation:{available:false,registration_price_usd:99}}]}});
 assert.ok(csv.includes("\"'=HYPERLINK"));assert.ok(csv.includes('"false"'));assert.ok(csv.includes('"99"'));
 const json=JSON.parse(exportComparison({schema_version:1,candidates:[{domain:'one.com'},{domain:'two.com'}],checks:[{domain:'one.com',status:'REGISTERED',checked_at:'2026-09-26'}]},{format:'json'}));
 assert.equal(json.rows[1].status,'NOT_CHECKED');assert.equal(json.rows[0].status,'REGISTERED');
});
test('refresh imports reject fabricated zero/invalid prices and missing provenance',()=>{
 for(const price of [null,-1,'9.99',Infinity])assert.throws(()=>validateMetadata([{tld:'com',annual_price_usd:price}],'pricing'));
 assert.throws(()=>validateMetadata([{tld:'com',registration_options:[{provider:'Example',url:'https://example.com'}]}],'registrars'));
});
test('export registrar identity matches the chosen direct registration URL',()=>{
 const json=JSON.parse(exportComparison({results:[{domain:'example.app'}]},{format:'json'}));
 const r=json.rows[0];
 assert.equal(r.registrar,'Namecheap');assert.ok(r.registration_url.startsWith('https://www.namecheap.com/'));
});
