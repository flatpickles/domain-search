#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {atomicSave}=require('../cli/lib/sessions');
const {validatePolicies}=require('../cli/lib/eligibility');
const {isPublicNamespace}=require('../cli/lib/namespaces');
const root=path.join(__dirname,'../cli/data');
const sources={iana:{file:'root-tlds.txt',url:'https://data.iana.org/TLD/tlds-alpha-by-domain.txt'},psl:{file:'public-suffix-list.dat',url:'https://publicsuffix.org/list/public_suffix_list.dat'},pricing:{file:'tlds.json'},registrars:{file:'tlds.json'},eligibility:{file:'eligibility.json'},cloudflare:{file:'cloudflare-tlds.txt'}};
function validateMetadata(rows,kind) {
 if(!Array.isArray(rows))throw new Error('Import must be an array of TLD records.');
 const seen=new Set();
 for(const r of rows){
  if(!r || typeof r.tld!=='string' || !isPublicNamespace(r.tld)||seen.has(r.tld))throw new Error('Invalid/duplicate TLD namespace.');seen.add(r.tld);
  if(kind==='pricing' && (typeof r.annual_price_usd!=='number'||!Number.isFinite(r.annual_price_usd)||r.annual_price_usd<0||!r.price_source_name||!/^https:\/\//.test(r.price_source_url||'')||!Number.isFinite(Date.parse(r.price_updated_at))))throw new Error('Prices need a finite nonnegative amount, source name/HTTPS URL, and date.');
  if(kind==='registrars' && (!Array.isArray(r.registration_options)||r.registration_options.some(o=>!o.provider||!o.kind||!/^https:\/\//.test(o.source_url||'')||!Number.isFinite(Date.parse(o.verified_at))||!/^https:\/\//.test(o.url||o.url_template||''))))throw new Error('Registrar options need sourced, dated HTTPS targets.');
 }
 return rows;
}
async function main(argv){
 const kind=argv[0], source=sources[kind];if(!source)throw new Error('Usage: refresh-data.js iana|psl|pricing|registrars|eligibility|cloudflare [--input file] [--apply]');
 let input,apply=false;
 for(let i=1;i<argv.length;i++){if(argv[i]==='--apply')apply=true;else if(argv[i]==='--input'&&argv[i+1])input=argv[++i];else throw new Error(`Unknown/missing option: ${argv[i]}`);}
 if(!input&&!source.url)throw new Error('This data needs a reviewed --input file with per-record provenance.');
 let raw;
 if(input)raw=fs.readFileSync(input,'utf8');else{const r=await fetch(source.url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);raw=await r.text();}
 const target=path.join(root,source.file);const before=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
 let next=raw;
 if(kind==='iana'){
  const lines=raw.trim().split(/\r?\n/);if(!/^# Version \d+/.test(lines[0])||lines.length<1000||lines.slice(1).some(x=>! /^[A-Z0-9-]+$/.test(x)))throw new Error('Invalid IANA snapshot.');
 }
 if(kind==='psl'&&(!raw.includes('// ===BEGIN ICANN DOMAINS===')||!raw.includes('// ===END ICANN DOMAINS===')||!raw.includes('// ===END PRIVATE DOMAINS===')||raw.length<100000))throw new Error('Invalid/truncated PSL snapshot.');
 if(kind==='cloudflare'){
  if(!/^# Source: https:\/\//m.test(raw)||!/^# Verified: \d{4}-\d{2}-\d{2}/m.test(raw))throw new Error('Cloudflare list needs Source and Verified comment headers.');
  const entries=raw.split(/\r?\n/).filter(x=>x&&!x.startsWith('#'));if(!entries.length||entries.some(x=>!isPublicNamespace(x)))throw new Error('Invalid Cloudflare namespace list.');
 }
 if(kind==='eligibility')next=JSON.stringify(validatePolicies(JSON.parse(raw)),null,2)+'\n';
 if(kind==='pricing'||kind==='registrars'){
  const rows=validateMetadata(JSON.parse(raw),kind);const merged=new Map(JSON.parse(before).map(r=>[r.tld,r]));
  const fields=kind==='pricing'?['annual_price_usd','price_updated_at','price_source_name','price_source_url']:['registration_options','preferred_registration_provider','fallback_registration_provider'];
  for(const r of rows){const item=merged.get(r.tld)||{tld:r.tld,annual_price_usd:null};for(const f of fields)if(r[f]!==undefined)item[f]=r[f];merged.set(r.tld,item);}
  next=JSON.stringify([...merged.values()].sort((a,b)=>a.tld.localeCompare(b.tld)),null,2)+'\n';
 }
 const oldLines=new Set(before.split('\n')),newLines=new Set(next.split('\n'));
 const diff={kind,target,changed:before!==next,added:[...newLines].filter(l=>!oldLines.has(l)),removed:[...oldLines].filter(l=>!newLines.has(l)),applied:apply};
 if(apply){const tmp=`${target}.${process.pid}.tmp`;try{fs.writeFileSync(tmp,next);fs.renameSync(tmp,target);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  const manifestPath=path.join(root,'provenance.json');const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{};
  manifest[source.file]={refreshed_at:new Date().toISOString(),source_url:source.url||'per-record provenance / reviewed import',sha256:createHash('sha256').update(next).digest('hex')};atomicSave(manifestPath,manifest);
 }
 process.stdout.write(JSON.stringify(diff,null,2)+'\n');
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateMetadata};
