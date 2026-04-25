const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { domainToASCII } = require("node:url");
const {
  AVAILABLE_PATTERNS,
  RDAP_URL_TEMPLATES,
  REGISTERED_PATTERNS,
  WHOIS_HOST_OVERRIDES,
} = require("./constants");
const { normalizeTld } = require("./tlds");

const execFileAsync = promisify(execFile);
const IANA_RDAP_DNS_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const WHOIS_SECTION_MARKER = /^#\s*whois\.[^\n]+\s*$/gim;
let rdapQueue = Promise.resolve();
let rdapNextReadyAt = 0;
let rdapBootstrapPromise = null;

function normalizeDomain(domain) {
  const trimmed = String(domain)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  const ascii = domainToASCII(trimmed);
  return ascii || trimmed;
}

function getDomainTld(domain) {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split(".");
  return parts.length > 1 ? normalizeTld(parts.at(-1)) : "";
}

function wait(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isIanaTldRecord(section, domain) {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain || !normalizedDomain.includes(".")) return false;
  if (!/\bsource:\s*iana\b/i.test(section)) return false;

  const tld = getDomainTld(normalizedDomain);
  const normalizedSection = String(section || "");
  const fqdnPattern = new RegExp(`\\b${escapeRegExp(normalizedDomain)}\\b`, "i");
  const tldPattern = new RegExp(`^domain:\\s+${escapeRegExp(tld)}\\s*$`, "im");

  return !fqdnPattern.test(normalizedSection) && tldPattern.test(normalizedSection);
}

function classifyWhois(raw, options = {}) {
  const sections = splitWhoisSections(raw).filter((section) => !isIanaTldRecord(section, options.domain));
  if (sections.length === 0) return "UNKNOWN";

  const authoritativeSections = sections.length > 1 ? [sections[0]] : sections;
  const referralSections = sections.length > 1 ? sections.slice(1) : [];
  const authoritativeStatuses = authoritativeSections.map(classifyWhoisSection);

  if (authoritativeStatuses.includes("REGISTERED")) return "REGISTERED";
  if (referralSections.some((section) => classifyWhoisSection(section) === "REGISTERED")) return "REGISTERED";
  if (authoritativeStatuses.includes("AVAILABLE")) return "AVAILABLE";
  return "UNKNOWN";
}

function splitWhoisSections(raw) {
  const normalized = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const markers = [...normalized.matchAll(WHOIS_SECTION_MARKER)];
  if (markers.length === 0) return [normalized];

  const sections = [];

  for (let index = 0; index < markers.length; index += 1) {
    const start = markers[index].index;
    const end = index + 1 < markers.length ? markers[index + 1].index : normalized.length;
    const section = normalized.slice(start, end).trim();
    if (section) sections.push(section);
  }

  return sections;
}

function classifyWhoisSection(section) {
  if (!section || !String(section).trim()) return "UNKNOWN";
  if (REGISTERED_PATTERNS.some((pattern) => pattern.test(section))) return "REGISTERED";
  if (AVAILABLE_PATTERNS.some((pattern) => pattern.test(section))) return "AVAILABLE";
  return "UNKNOWN";
}

function getWhoisArgs(domain, options = {}) {
  const normalized = normalizeDomain(domain);
  const tld = getDomainTld(normalized);
  const host =
    (options.whoisHostOverrides && options.whoisHostOverrides[tld]) ||
    WHOIS_HOST_OVERRIDES[tld];

  return host ? ["-h", host, normalized] : [normalized];
}

function buildRdapDomainUrl(baseUrl, domain) {
  if (!baseUrl) return null;
  return `${String(baseUrl).replace(/\/?$/, "/")}domain/${encodeURIComponent(normalizeDomain(domain))}`;
}

async function fetchRdapBootstrap(fetchFn, options = {}) {
  const timeoutMs = Number(options.rdapBootstrapTimeout ?? 8000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(options.rdapBootstrapUrl || IANA_RDAP_DNS_BOOTSTRAP_URL, {
      headers: {
        accept: "application/json",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRdapBootstrap(options = {}) {
  if (options.rdapBootstrap) return options.rdapBootstrap;

  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== "function") return null;

  const shouldUseSharedCache = !options.fetchFn && !options.rdapBootstrapUrl;
  if (!shouldUseSharedCache) return fetchRdapBootstrap(fetchFn, options);

  if (!rdapBootstrapPromise) {
    rdapBootstrapPromise = fetchRdapBootstrap(fetchFn, options)
      .then((data) => {
        if (!data) rdapBootstrapPromise = null;
        return data;
      })
      .catch(() => {
        rdapBootstrapPromise = null;
        return null;
      });
  }
  return rdapBootstrapPromise;
}

function getRdapBootstrapBaseUrl(data, tld) {
  const normalizedTld = normalizeTld(tld);
  const services = Array.isArray(data?.services) ? data.services : [];

  for (const service of services) {
    const labels = Array.isArray(service?.[0]) ? service[0].map(normalizeTld) : [];
    const urls = Array.isArray(service?.[1]) ? service[1] : [];
    if (labels.includes(normalizedTld) && urls.length > 0) return urls[0];
  }

  return null;
}

async function getRdapLookup(domain, options = {}) {
  const tld = getDomainTld(domain);
  const template = RDAP_URL_TEMPLATES[tld];
  if (template) {
    return {
      url: template.replaceAll("{domain}", encodeURIComponent(normalizeDomain(domain))),
      notFoundStatus: "AVAILABLE",
    };
  }

  const bootstrap = await loadRdapBootstrap(options);
  const baseUrl = getRdapBootstrapBaseUrl(bootstrap, tld);
  const url = buildRdapDomainUrl(baseUrl, domain);
  return {
    url,
    notFoundStatus: options.trustRdapBootstrapNotFound ? "AVAILABLE" : "UNKNOWN",
  };
}

async function runRdapRequest(task, options = {}) {
  const minIntervalMs = Number(options.rdapMinInterval ?? 1500);
  const run = async () => {
    const delayMs = Math.max(0, rdapNextReadyAt - Date.now());
    if (delayMs > 0) await wait(delayMs);

    try {
      return await task();
    } finally {
      rdapNextReadyAt = Date.now() + minIntervalMs;
    }
  };

  const pending = rdapQueue.then(run, run);
  rdapQueue = pending.catch(() => {});
  return pending;
}

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return null;

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const dateMs = Date.parse(headerValue);
  if (Number.isNaN(dateMs)) return null;

  return Math.max(0, dateMs - Date.now());
}

function rdapResponseMatchesDomain(data, domain) {
  if (!data || typeof data !== "object") return false;

  const normalized = normalizeDomain(domain);
  const ldhName = typeof data.ldhName === "string" ? normalizeDomain(data.ldhName) : "";
  const unicodeName = typeof data.unicodeName === "string" ? normalizeDomain(data.unicodeName) : "";

  return ldhName === normalized || unicodeName === normalized;
}

async function checkDomainViaRdap(domain, options = {}) {
  const normalized = normalizeDomain(domain);
  const lookup = await getRdapLookup(normalized, options);
  const url = lookup.url;
  if (!url) return null;

  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== "function") return null;

  const timeoutMs = Number(options.rdapTimeout ?? 8000);
  const maxAttempts = Math.max(1, Number(options.rdapRetries ?? 4));

  try {
    let response = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await runRdapRequest(
          () =>
            fetchFn(url, {
              headers: {
                accept: "application/rdap+json, application/json",
              },
              redirect: "follow",
              signal: controller.signal,
            }),
          options,
        );
      } finally {
        clearTimeout(timeout);
      }

      if (response.status !== 429 || attempt === maxAttempts) break;

      const retryDelayMs =
        parseRetryAfterMs(response.headers?.get?.("retry-after")) ||
        Number(options.rdapRetryDelay ?? 5000) * attempt;
      await wait(retryDelayMs);
    }

    if (response.status === 404) {
      return {
        domain: normalized,
        status: lookup.notFoundStatus,
      };
    }

    if (!response.ok) {
      return {
        domain: normalized,
        status: "UNKNOWN",
      };
    }

    const data = await response.json();
    return {
      domain: normalized,
      status: rdapResponseMatchesDomain(data, normalized) ? "REGISTERED" : "UNKNOWN",
    };
  } catch {
    return {
      domain: normalized,
      status: "UNKNOWN",
    };
  }
}

async function checkDomain(domain, options = {}) {
  const normalized = normalizeDomain(domain);
  const execFileFn = options.execFileFn || execFileAsync;
  const args = getWhoisArgs(normalized, options);
  const timeout = ["com", "net"].includes(getDomainTld(normalized)) ? 8000 : 20000;
  const tld = getDomainTld(normalized);

  try {
    const { stdout } = await execFileFn(
      process.env.DOMAIN_SEARCH_WHOIS_BIN || "whois",
      args,
      {
        encoding: "utf8",
        timeout,
        maxBuffer: 1024 * 1024,
      },
    );
    let status = classifyWithTldHints(classifyWhois(stdout, { domain: normalized }), stdout, tld);
    if (status === "UNKNOWN") {
      const rdapResult = await checkDomainViaRdap(normalized, options);
      if (rdapResult?.status) status = rdapResult.status;
    }
    return {
      domain: normalized,
      status,
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error("The `whois` command is required but was not found on PATH.");
    }
    const stdout = error && error.stdout ? String(error.stdout) : "";
    const stderr = error && error.stderr ? String(error.stderr) : "";
    const raw = `${stdout}\n${stderr}`;
    let status = classifyWithTldHints(classifyWhois(raw, { domain: normalized }), raw, tld);

    if (status === "UNKNOWN") {
      const rdapResult = await checkDomainViaRdap(normalized, options);
      if (rdapResult?.status) status = rdapResult.status;
    }

    return {
      domain: normalized,
      status,
    };
  }
}

function classifyWithTldHints(status, raw, tld) {
  if (status !== "UNKNOWN") return status;
  if (tld === "me" && /\bnot registered\b/i.test(raw)) return "AVAILABLE";
  if (tld === "app" && /\bdomain not found\b/i.test(raw)) return "AVAILABLE";
  if (tld === "app" && /\bgoogle registry\b/i.test(raw) && /\bcreation date\b/i.test(raw)) return "REGISTERED";
  return status;
}

module.exports = {
  checkDomain,
  checkDomainViaRdap,
  classifyWhois,
  getDomainTld,
  getWhoisArgs,
  normalizeDomain,
};
