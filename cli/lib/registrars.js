const fs = require("node:fs");
const path = require("node:path");
const { isKnownRootTld, normalizeTld } = require("./tlds");

const CLOUDFLARE_TLDS_PATH = path.join(__dirname, "..", "data", "cloudflare-tlds.txt");
const CLOUDFLARE_VERIFIED_AT = "2026-04-25";
const NAMECHEAP_VERIFIED_AT = "2026-03-29";
const DEDICATED_REGISTRATION_KINDS = new Set([
  "dedicated_registrar",
  "registry_homepage",
  "registry_register",
]);

let cachedCloudflareTlds = null;

function loadCloudflareTlds() {
  if (cachedCloudflareTlds) return cachedCloudflareTlds;

  const raw = fs.readFileSync(CLOUDFLARE_TLDS_PATH, "utf8");
  cachedCloudflareTlds = new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(normalizeTld)
      .filter(Boolean),
  );
  return cachedCloudflareTlds;
}

function isCloudflareSupportedTld(tld) {
  const normalized = normalizeTld(tld);
  return normalized ? loadCloudflareTlds().has(normalized) : false;
}

function buildCloudflareOption() {
  return {
    provider: "Cloudflare",
    kind: "registrar_register",
    url: "https://dash.cloudflare.com/?to=/:account/registrar/register",
    source_name: "Cloudflare Registrar register domains page",
    source_url: "https://developers.cloudflare.com/registrar/get-started/register-domain/",
    verified_at: CLOUDFLARE_VERIFIED_AT,
  };
}

function buildNamecheapOption() {
  return {
    provider: "Namecheap",
    kind: "registrar_search",
    url_template: "https://www.namecheap.com/domains/registration/results/?domain={domain}",
    source_name: "Namecheap domain search",
    source_url: "https://www.namecheap.com/domains/registration/results/",
    verified_at: NAMECHEAP_VERIFIED_AT,
  };
}

function isDedicatedRegistrationOption(option) {
  return option && DEDICATED_REGISTRATION_KINDS.has(option.kind);
}

function resolveRegistrarMetadata(entry = {}) {
  const tld = normalizeTld(entry.tld);
  const existingOptions = entry.registration_options || [];
  if (!tld || !isKnownRootTld(tld)) {
    return {
      preferred_registration_provider: entry.preferred_registration_provider || null,
      fallback_registration_provider: entry.fallback_registration_provider || null,
      registration_options: existingOptions,
    };
  }

  const dedicatedOptions = existingOptions.filter(isDedicatedRegistrationOption);
  const requiresDedicatedRegistrar = Boolean(entry.requires_dedicated_registrar);
  const cloudflareSupported = isCloudflareSupportedTld(tld);

  if (requiresDedicatedRegistrar || (dedicatedOptions.length > 0 && !cloudflareSupported)) {
    const preferredOption = dedicatedOptions[0] || existingOptions[0] || null;
    return {
      preferred_registration_provider: preferredOption?.provider || entry.preferred_registration_provider || null,
      fallback_registration_provider: null,
      registration_options: existingOptions,
    };
  }

  if (cloudflareSupported) {
    return {
      preferred_registration_provider: "Cloudflare",
      fallback_registration_provider: "Namecheap",
      registration_options: [
        buildCloudflareOption(),
        buildNamecheapOption(),
      ],
    };
  }

  return {
    preferred_registration_provider: "Namecheap",
    fallback_registration_provider: "Namecheap",
    registration_options: [buildNamecheapOption()],
  };
}

module.exports = {
  isCloudflareSupportedTld,
  resolveRegistrarMetadata,
};
