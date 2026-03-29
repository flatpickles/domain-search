const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  AVAILABLE_PATTERNS,
  REGISTERED_PATTERNS,
  WHOIS_HOST_OVERRIDES,
} = require("./constants");

const execFileAsync = promisify(execFile);

function normalizeDomain(domain) {
  return String(domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function getDomainTld(domain) {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

function classifyWhois(raw) {
  if (!raw || !String(raw).trim()) return "UNKNOWN";
  if (AVAILABLE_PATTERNS.some((pattern) => pattern.test(raw))) return "AVAILABLE";
  if (REGISTERED_PATTERNS.some((pattern) => pattern.test(raw))) return "REGISTERED";
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
      status: classifyWhois(stdout),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error("The `whois` command is required but was not found on PATH.");
    }
    const stdout = error && error.stdout ? String(error.stdout) : "";
    const stderr = error && error.stderr ? String(error.stderr) : "";
    return {
      domain: normalized,
      status: classifyWhois(`${stdout}\n${stderr}`),
    };
  }
}

module.exports = {
  checkDomain,
  classifyWhois,
  getWhoisArgs,
  normalizeDomain,
};
