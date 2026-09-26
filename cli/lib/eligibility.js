const fs = require('node:fs');
const bundled = require('../data/eligibility.json');
const { domainParts, isPublicNamespace } = require('./namespaces');
const { getRegistrationRestriction } = require('./tld-metadata');

function validatePolicies(rules) {
  if (!Array.isArray(rules)) throw new Error('Policy data must be an array.');
  const seen=new Set();
  for(const r of rules) {
    if (!r || typeof r.namespace !== 'string' || !isPublicNamespace(r.namespace) || seen.has(r.namespace)) throw new Error('Policy namespaces must be unique public suffixes.');
    seen.add(r.namespace);
    if (!['open','closed','restricted'].includes(r.access) || !/^https:\/\//.test(r.source_url || '') || !Number.isFinite(Date.parse(r.verified_at)) || !r.summary) throw new Error('Policy needs access, summary, HTTPS source_url, and verified_at.');
    if (r.min_label_length != null && (!Number.isInteger(r.min_label_length) || r.min_label_length<1 || r.min_label_length>63)) throw new Error('Invalid policy minimum label length.');
    if (r.allowed_countries && (!Array.isArray(r.allowed_countries) || r.allowed_countries.some(c=> !/^[A-Z]{2}$/.test(c)))) throw new Error('Policy countries must be two-letter codes.');
    if (r.entities && (!Array.isArray(r.entities) || r.entities.some(e=> !['individual','organization','government'].includes(e)))) throw new Error('Invalid policy entities.');
    if (r.access === 'restricted' && !r.entities && !r.allowed_countries && !r.manual_review) throw new Error('Restricted policy needs criteria or manual_review.');
  }
  return rules;
}
function loadEligibility(options = {}) {
  const profile=options.profileFile ? JSON.parse(fs.readFileSync(options.profileFile,'utf8')) : options.profile || {};
  if (profile.country != null && !/^[A-Z]{2}$/.test(profile.country)) throw new Error('Profile country must be an uppercase two-letter country code.');
  if (profile.entity != null && !['individual','organization','government'].includes(profile.entity)) throw new Error('Profile entity must be individual, organization, or government.');
  const custom=options.policiesFile ? validatePolicies(JSON.parse(fs.readFileSync(options.policiesFile,'utf8'))) : options.policies ? validatePolicies(options.policies) : [];
  return { profile, rules: new Map([...bundled,...custom].map(r=>[r.namespace,r])) };
}
function assessEligibility(domain, context = loadEligibility()) {
  const parts=domainParts(domain);
  const policy=context.rules.get(parts.namespace);
  const base={namespace:parts.namespace, status:'unknown', summary:'No reviewed policy for this namespace.', source_url:null, verified_at:null};
  if (!parts.is_registration_domain) return {...base,status:'ineligible',summary:'This is a public suffix or subdomain, not a registration-level domain.'};
  if (!policy) {
    const restriction=getRegistrationRestriction(parts.namespace);
    return {...base,summary:restriction?.summary || base.summary};
  }
  const evidence={...base,summary:policy.summary,source_url:policy.source_url,verified_at:policy.verified_at};
  // Old policy snapshots are evidence to revisit, not current eligibility proof.
  if (Date.now()-Date.parse(policy.verified_at)>180*86400000) return {...evidence,summary:`Policy needs refresh. ${policy.summary}`};
  if(policy.access==='closed') return {...evidence,status:'ineligible'};
  if(policy.min_label_length && parts.label.length<policy.min_label_length) return {...evidence,status:'ineligible',summary:`Minimum label length is ${policy.min_label_length}. ${policy.summary}`};
  if(policy.allowed_countries) {
    if(!context.profile.country) return evidence;
    if(!policy.allowed_countries.includes(context.profile.country)) return {...evidence,status:'ineligible'};
  }
  if(policy.entities) {
    if(!context.profile.entity) return evidence;
    if(!policy.entities.includes(context.profile.entity)) return {...evidence,status:'ineligible'};
  }
  return {...evidence,status:policy.manual_review ? 'unknown' : 'eligible'};
}
module.exports={validatePolicies,loadEligibility,assessEligibility};
