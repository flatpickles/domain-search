const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  AVAILABLE_PATTERNS,
  REGISTERED_PATTERNS,
  WHOIS_HOST_OVERRIDES,
} = require("./constants");

const execFileAsync = promisify(execFile);
const WHOIS_SECTION_MARKER = /^#\s*whois\.[^\n]+\s*$/gim;

function normalizeDomain(domain) {
  return String(domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function getDomainTld(domain) {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

function classifyWhois(raw) {
  const sections = splitWhoisSections(raw);
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
    return {
      domain: normalized,
      status: classifyWithTldHints(classifyWhois(stdout), stdout, tld),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error("The `whois` command is required but was not found on PATH.");
    }
    const stdout = error && error.stdout ? String(error.stdout) : "";
    const stderr = error && error.stderr ? String(error.stderr) : "";
    return {
      domain: normalized,
      status: classifyWithTldHints(classifyWhois(`${stdout}\n${stderr}`), `${stdout}\n${stderr}`, tld),
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
  classifyWhois,
  getDomainTld,
  getWhoisArgs,
  normalizeDomain,
};
