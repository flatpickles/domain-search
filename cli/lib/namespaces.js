const fs = require('node:fs');
const path = require('node:path');
const { domainToASCII } = require('node:url');
let rules;
function loadRules() {
  if (rules) return rules;
  const raw = fs.readFileSync(path.join(__dirname,'../data/public-suffix-list.dat'),'utf8');
  rules = new Set(raw.split('// ===END ICANN DOMAINS===')[0].split(/\r?\n/)
    .map(x => x.trim()).filter(x => x && !x.startsWith('//'))
    .map(x => x.startsWith('!') ? `!${domainToASCII(x.slice(1))}` : x.startsWith('*.') ? `*.${domainToASCII(x.slice(2))}` : domainToASCII(x)));
  return rules;
}
function domainParts(domain) {
  const labels = domain.toLowerCase().split('.');
  const rules = loadRules();
  let count = 1;
  for (let i=0;i<labels.length;i++) {
    const suffix=labels.slice(i).join('.');
    if (rules.has(`!${suffix}`)) { count=labels.length-i-1; break; }
    if (rules.has(suffix)) count=Math.max(count,labels.length-i);
    if (i>0 && rules.has(`*.${suffix}`)) count=Math.max(count,labels.length-i+1);
  }
  const namespace=labels.slice(-count).join('.');
  const registrable=labels.length>count ? labels.slice(-count-1).join('.') : null;
  return { namespace, registrable, is_registration_domain: registrable === domain.toLowerCase(),
    label: labels.length>count ? labels[labels.length-count-1] : null };
}
function isPublicNamespace(namespace) {
  return domainParts(`domainsearchprobe.${namespace}`).namespace === namespace;
}
module.exports = { domainParts, isPublicNamespace };
