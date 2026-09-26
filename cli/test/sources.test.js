const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCandidates, checkCandidates } = require('../lib/search');
const { scoreExact } = require('../lib/candidates');
test('source meaning and kind survive generation; acronym does not claim real word',()=>{
 const x=generateCandidates({tlds:'app',sources:[{word:'nt',kind:'acronym',rationale:'Notes',priority:10},{word:'cadence',kind:'word'}]});
 assert.equal(x.candidates[0].domain,'nt.app'); assert.equal(x.candidates[0].candidate_type,'brandable');
 assert.equal(x.candidates[0].rationale,'Notes'); assert.equal(x.candidates[0].sources[0].kind,'acronym');
});
test('explicit ratings and preferences filter without fabricating commonness',()=>{
 const x=generateCandidates({tlds:'app',minCommonness:0.7,sources:[{word:'cadence',commonness:0.9},{word:'rhythm',commonness:0.8},{word:'unknown'}],preferences:{rejected:['cadence.app']}});
 assert.deepEqual(x.candidates.map(x=>x.domain),['rhythm.app']);
 assert.throws(()=>generateCandidates({words:['cadence'],minCommonness:0.7}),/structured sources/);
});
test('likes and phonetic alternatives retain explicit provenance',()=>{
 const x=generateCandidates({tlds:'app',sources:[{word:'notemark',kind:'coined',phonetic_alternatives:['notemarc']},'cadence'],preferences:{liked:['notemarc']}});
 assert.equal(x.candidates[0].domain,'notemarc.app');assert.equal(x.candidates[0].sources[0].alternative_of,'notemark');
});
test('generation preferences do not silently suppress provided checks',async()=>{
 const x=await checkCandidates({candidates:['cadence.app'],preferences:{rejected:['cadence.app']},checkDomainFn:async()=> 'AVAILABLE',progressFormat:'silent'});
 assert.equal(x.checked,1);
});
test('empty structured sources do not fall back to the dictionary',()=>assert.equal(generateCandidates({sources:[]}).candidatePool,0));
test('naming benchmark keeps priority and label coverage without historical prefix boosts',()=>{
 // These pairs share spelling features. Old personal prefix bonuses favored only the first.
 for(const [a,b] of [['alien','avien'],['ember','omber'],['sable','sabre']]) assert.equal(scoreExact(a),scoreExact(b));
 const x=generateCandidates({tlds:'com,app,net',sources:[{word:'ibis',priority:10},{word:'swan',priority:10},{word:'wren',priority:10}]});
 assert.equal(new Set(x.candidates.slice(0,3).map(x=>x.word)).size,3);
});
