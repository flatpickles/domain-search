const fs = require("node:fs");
const path = require("node:path");
const { isKnownRootTld, normalizeTld } = require("./tlds");

const CLOUDFLARE_TLDS_PATH = path.join(__dirname, "..", "data", "cloudflare-tlds.txt");
const CLOUDFLARE_VERIFIED_AT = "2026-04-25";
const DEDICATED_REGISTRATION_KINDS = new Set([
  "dedicated_registrar",
  "registry_homepage",
  "registry_register",
]);
const REGISTRAR_REGISTRATION_KINDS = new Set([
  "registrar_register",
  "registrar_search",
  "registrar_tld_page",
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

function isDedicatedRegistrationOption(option) {
  return option && DEDICATED_REGISTRATION_KINDS.has(option.kind);
}

function isRegistrarRegistrationOption(option) {
  return option && REGISTRAR_REGISTRATION_KINDS.has(option.kind);
}

function dedupeRegistrationOptions(options) {
  const seen = new Set();
  const deduped = [];

  for (const option of options) {
    if (!option) continue;
    const key = `${option.provider || ""}:${option.kind || ""}:${option.url || option.url_template || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(option);
  }

  return deduped;
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
  const registrarOptions = existingOptions.filter(isRegistrarRegistrationOption);
  const requiresDedicatedRegistrar = Boolean(entry.requires_dedicated_registrar);
  const cloudflareSupported = isCloudflareSupportedTld(tld);

  if (cloudflareSupported) {
    const options = dedupeRegistrationOptions([
      buildCloudflareOption(),
      ...registrarOptions,
      ...dedicatedOptions,
    ]);
    const fallbackRegistrar = registrarOptions.find((option) => option.provider !== "Cloudflare") || null;
    return {
      preferred_registration_provider: "Cloudflare",
      fallback_registration_provider: fallbackRegistrar?.provider || null,
      registration_options: options,
    };
  }

  if (requiresDedicatedRegistrar) {
    const preferredOption = dedicatedOptions[0] || registrarOptions[0] || existingOptions[0] || null;
    return {
      preferred_registration_provider: preferredOption?.provider || entry.preferred_registration_provider || null,
      fallback_registration_provider: null,
      registration_options: existingOptions,
    };
  }

  if (registrarOptions.length > 0) {
    const preferredOption = registrarOptions[0];
    const fallbackOption = registrarOptions.find((option) => option.provider !== preferredOption.provider) || null;
    return {
      preferred_registration_provider: preferredOption.provider,
      fallback_registration_provider: fallbackOption?.provider || null,
      registration_options: dedupeRegistrationOptions([...registrarOptions, ...dedicatedOptions]),
    };
  }

  if (dedicatedOptions.length > 0) {
    const preferredOption = dedicatedOptions[0];
    return {
      preferred_registration_provider: preferredOption.provider,
      fallback_registration_provider: null,
      registration_options: dedicatedOptions,
    };
  }

  return {
    preferred_registration_provider: null,
    fallback_registration_provider: null,
    registration_options: existingOptions,
  };
}

module.exports = {
  isCloudflareSupportedTld,
  resolveRegistrarMetadata,
};
