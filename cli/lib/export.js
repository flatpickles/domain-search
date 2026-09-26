const { normalizeName } = require('./finalists');
const { domainParts } = require('./namespaces');
const { enrichWithPricing } = require('./pricing');
const { assessEligibility } = require('./eligibility');
const columns=['domain','meaning','joined_word','status','checked_at','verification_source','unknown_reason','eligibility','eligibility_note','tld_estimate_usd','estimate_date','registrar','buyable','premium','registration_usd','renewal_usd','minimum_years','quote_date','app_store_findings','registration_url'];
function comparisonRows(input,evidence=[]) {
  if (!Array.isArray(evidence)) evidence=[evidence];
  const confirmations=new Map();const collisions=[];
  for(const document of evidence) {
    for(const item of document.results || []) {
      if(item.registrar_confirmation && item.domain) confirmations.set(item.domain,item.registrar_confirmation);
      if(item.name && item.storefront) collisions.push(item);
    }
  }
  let items=Array.isArray(input) ? input : input.results || input.candidates || [];
  if(input.schema_version===1 && input.candidates && input.checks) {
    const checks=new Map(input.checks.map(c=>[c.domain,c]));
    items=input.candidates.map(c=>({...c,...checks.get(c.domain)}));
  }
  return items.map(raw=>{
    const item=typeof raw==='string'? {domain:raw}:raw;
    const parts=domainParts(item.domain);
    const enriched=enrichWithPricing({...item,tld:parts.namespace});
    const quote=confirmations.get(item.domain)||item.registrar_confirmation||{};
    const eligibility=item.eligibility||assessEligibility(item.domain);
    const collision=collisions.filter(c=>normalizeName(c.name)===normalizeName(item.word||parts.label));
    return {domain:item.domain,meaning:item.rationale||item.description||'',joined_word:item.joined_word||'',status:item.status||'NOT_CHECKED',checked_at:item.checked_at||'',
      verification_source:item.verification_source||'',unknown_reason:item.unknown_reason||'',eligibility:eligibility.status,eligibility_note:eligibility.summary,
      tld_estimate_usd:enriched.price,estimate_date:enriched.price_updated_at,registrar:quote.provider||(enriched.direct_registration_url ? enriched.direct_registration_provider : enriched.registration_provider),
      buyable:quote.available ?? null,premium:quote.premium ?? null,registration_usd:quote.registration_price_usd ?? null,
      renewal_usd:quote.renewal_price_usd ?? null,minimum_years:quote.minimum_years ?? null,quote_date:quote.checked_at||'',
      app_store_findings:collision.map(c=>`${c.storefront}: ${c.conclusion||c.reason||c.status} (${c.source_url})`).join('; '),
      registration_url:quote.registration_url||enriched.direct_registration_url||enriched.registration_url||''};
  });
}
function csvCell(value) {
  let text=value==null?'':String(value);
  if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)) text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
function exportComparison(input,options={}) {
  const rows=comparisonRows(input,options.evidence);
  if(options.format==='json') return `${JSON.stringify({kind:'comparison',rows},null,2)}\n`;
  if(options.format==='csv') return [columns.join(','),...rows.map(row=>columns.map(c=>csvCell(row[c])).join(','))].join('\n')+'\n';
  const fields=['domain','meaning','status','checked_at','eligibility','tld_estimate_usd','registration_usd','renewal_usd','premium','app_store_findings','registration_url'];
  const cell=v=>String(v??'—').replaceAll('|','\\|').replace(/[\r\n]+/g,' ').replaceAll('<','&lt;');
  return [fields.join(' | '),fields.map(()=> '---').join(' | '),...rows.map(row=>fields.map(c=>cell(row[c])).join(' | '))].join('\n')+'\n';
}
module.exports={comparisonRows,exportComparison};
