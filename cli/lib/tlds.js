const fs = require("node:fs");
const path = require("node:path");
const { domainToASCII } = require("node:url");

const ROOT_TLDS_PATH = path.join(__dirname, "..", "data", "root-tlds.txt");
let cachedRootTlds = null;
let cachedRootTldVersion = null;

function normalizeTld(value) {
  const trimmed = String(value || "").trim().replace(/^\./, "").replace(/\.$/, "");
  if (!trimmed) return "";

  const ascii = domainToASCII(trimmed);
  return (ascii || trimmed).toLowerCase();
}

function normalizeTlds(tlds, fallback) {
  const source =
    typeof tlds === "string"
      ? tlds.split(",")
      : Array.isArray(tlds)
        ? tlds
        : fallback;

  return [...new Set(
    (source || [])
      .map(normalizeTld)
      .filter(Boolean),
  )];
}

function loadRootTldData() {
  if (cachedRootTlds) {
    return {
      tlds: cachedRootTlds,
      version: cachedRootTldVersion,
    };
  }

  const raw = fs.readFileSync(ROOT_TLDS_PATH, "utf8");
  const lines = raw.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith("#")) || null;
  const versionMatch = header && header.match(/Version\s+(\d+)/i);

  cachedRootTldVersion = versionMatch ? versionMatch[1] : null;
  cachedRootTlds = new Set(
    lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(normalizeTld)
      .filter(Boolean),
  );

  return {
    tlds: cachedRootTlds,
    version: cachedRootTldVersion,
  };
}

function getRootTlds() {
  return new Set(loadRootTldData().tlds);
}

function getRootTldVersion() {
  return loadRootTldData().version;
}

function isKnownRootTld(tld) {
  if (!tld) return false;
  return loadRootTldData().tlds.has(normalizeTld(tld));
}

function formatTldList(tlds) {
  return tlds.map((tld) => `.${tld}`).join(", ");
}

function assertKnownRootTlds(tlds, context) {
  const unsupported = [...new Set(normalizeTlds(tlds, []))]
    .filter((tld) => !isKnownRootTld(tld));
  if (unsupported.length === 0) return;

  throw new Error(
    `Unknown or unsupported TLDs in ${context}: ${formatTldList(unsupported)}. Use a delegated IANA root-zone TLD.`,
  );
}

module.exports = {
  assertKnownRootTlds,
  formatTldList,
  getRootTlds,
  getRootTldVersion,
  isKnownRootTld,
  normalizeTld,
  normalizeTlds,
};
