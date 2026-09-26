const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { getRootTldVersion } = require('./tlds');
async function doctor(options={}) {
  let whois=false;
  try { await promisify(execFile)(process.env.DOMAIN_SEARCH_WHOIS_BIN || 'whois',['--version'],{timeout:2000,maxBuffer:4096}); whois=true; }
  catch(error) { whois=error.code !== 'ENOENT'; }
  const result={kind:'doctor',node:process.version,node_supported:Number(process.versions.node.split('.')[0])>=22,
    fetch:typeof fetch==='function',whois,root_tld_version:getRootTldVersion(),network:'not_tested',
    advice:whois ? 'RDAP and WHOIS are available locally; network policies still apply.' : 'Use auto or rdap verification; WHOIS is optional but may improve ccTLD coverage.'};
  if(options.network) {
    try { const r=await fetch('https://data.iana.org/rdap/dns.json',{signal:AbortSignal.timeout(8000)}); result.network=r.ok ? 'https_ok' : `http_${r.status}`; await r.body?.cancel(); }
    catch { result.network='https_unreachable'; }
  }
  return result;
}
module.exports={doctor};
