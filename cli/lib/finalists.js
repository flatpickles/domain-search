const { validateDomain } = require('./whois');
const { schedule } = require('./scheduler');
const { domainParts } = require('./namespaces');

function money(value) {
  if (value == null || value === '' || !['string','number'].includes(typeof value)) return null;
  const n=Number(value);return Number.isFinite(n) && n>=0 ? n : null;
}
function yesNo(value) { return value === 'yes' ? true : value === 'no' ? false : null; }
async function confirmDomains(domains, options={}) {
  const normalized=[...new Set(domains.map(validateDomain))];
  if (!normalized.length || normalized.length>25) throw new Error('Confirm accepts 1–25 finalist domains.');
  if (normalized.some(d=>!domainParts(d).is_registration_domain)) throw new Error('Confirm needs registration-level domains, not suffixes/subdomains.');
  const apiKey=options.apiKey || process.env.PORKBUN_API_KEY;
  const secretKey=options.secretKey || process.env.PORKBUN_SECRET_API_KEY;
  const results=[];
  for(const domain of normalized) {
    const base={provider:'Porkbun',status:'unknown',available:null,premium:null,registration_price_usd:null,
      renewal_price_usd:null,minimum_years:null,checked_at:null,source_url:'https://porkbun.com/api/json/v3/documentation',
      registration_url:`https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`};
    if (!apiKey || !secretKey) { results.push({domain,registrar_confirmation:{...base,reason:'credentials_required'}});continue; }
    let evidence;
    try {
      const {response,data}=await schedule('porkbun',async()=>{
        const response=await (options.fetchFn || fetch)(`https://api.porkbun.com/api/json/v3/domain/checkDomain/${encodeURIComponent(domain)}`,{
          method:'POST',headers:{'content-type':'application/json'},redirect:'error',
          body:JSON.stringify({apikey:apiKey,secretapikey:secretKey}),signal:AbortSignal.timeout(10000),
        });
        const data=await response.json();return {response,data};
      },options.intervalMs ?? 1100);
      if (!response.ok || data.status!=='SUCCESS') {
        evidence={...base,checked_at:new Date().toISOString(),reason:response.status===429 || data.code==='RATE_LIMIT_EXCEEDED' ? 'rate_limited' : 'provider_error'};
      } else if (data.sandbox || response.headers?.get?.('x-porkbun-mock') === 'true') {
        evidence={...base,reason:'non_production_response',checked_at:new Date().toISOString()};
      } else {
        const quote=data.response || {};
        const available=yesNo(quote.avail);
        evidence={...base,status:available===null ? 'unknown' : 'quoted',available,premium:yesNo(quote.premium),
          registration_price_usd:money(quote.price),renewal_price_usd:money(quote.additional?.renewal?.price),
          first_year_promotion:yesNo(quote.firstYearPromo),minimum_years:Number.isInteger(quote.minDuration) && quote.minDuration>0 ? quote.minDuration : null,
          checked_at:new Date().toISOString(),reason:available===null ? 'invalid_response' : null};
      }
    } catch { evidence={...base,checked_at:new Date().toISOString(),reason:'network_or_response_error'}; }
    results.push({domain,registrar_confirmation:evidence});
    // Don't repeat a failing account-wide batch. Remaining domains are explicitly unattempted.
    if (['rate_limited','provider_error'].includes(evidence.reason)) {
      for(const next of normalized.slice(results.length)) results.push({domain:next,registrar_confirmation:{...base,registration_url:`https://porkbun.com/checkout/search?q=${encodeURIComponent(next)}`,reason:'batch_stopped'}});
      break;
    }
  }
  return {kind:'confirm',results};
}
const normalizeName=value=>String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
async function checkCollisions(names,options={}) {
  const country=String(options.country || 'US').toUpperCase();
  if(!/^[A-Z]{2}$/.test(country)) throw new Error('country must be a two-letter App Store storefront code.');
  names=[...new Set(names.map(n=>n.trim()).filter(Boolean))];
  if(!names.length || names.length>20) throw new Error('Collisions accepts 1–20 finalist product names.');
  const results=[];
  for(const name of names) {
    const url=new URL('https://itunes.apple.com/search');
    url.search=new URLSearchParams({term:name,country,media:'software',entity:'software',limit:'50'}).toString();
    const base={name,storefront:country,checked_at:null,source_url:url.href,status:'unknown',matches:[]};
    try {
      const data=await schedule('itunes.apple.com',async()=>{
        const response=await (options.fetchFn || fetch)(url.href,{signal:AbortSignal.timeout(10000)});
        if(!response.ok) throw new Error('store request failed');return response.json();
      },options.intervalMs ?? 3100);
      if(!Array.isArray(data.results)) throw new Error('invalid store response');
      const matches=data.results.filter(x=>typeof x.trackName==='string').map(x=>({
        name:x.trackName,developer:x.sellerName || x.artistName || null,url:x.trackViewUrl || null,
        match_type:normalizeName(x.trackName)===normalizeName(name) ? 'exact_normalized' : 'related_search_result',
      }));
      results.push({...base,status:'searched',checked_at:new Date().toISOString(),matches,truncated:data.results.length>=50,
        conclusion:matches.some(x=>x.match_type==='exact_normalized') ? 'exact_title_found' : 'no_exact_title_in_returned_results'});
    } catch { results.push({...base,checked_at:new Date().toISOString(),reason:'store_unreachable_or_invalid_response'}); }
  }
  return {kind:'collisions',scope:'Apple software search for the selected storefront; not exhaustive product or trademark clearance.',results};
}
module.exports={confirmDomains,checkCollisions,normalizeName};
