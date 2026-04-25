const tldMetadata = require("../data/tlds.json");
const { resolveRegistrarMetadata } = require("./registrars");
const { getRootTlds, normalizeTlds } = require("./tlds");

function buildPriceNote(entry) {
  if (!entry || !entry.price_updated_at || !entry.price_source_name) {
    return "No bundled pricing metadata is available for this TLD.";
  }

  return `Bundled pricing was updated as of ${entry.price_updated_at} from ${entry.price_source_name} and may now be out of date.`;
}

function createPlaceholderEntry(tld) {
  return {
    tld,
    annual_price_usd: null,
    price_updated_at: null,
    price_source_name: null,
    price_source_url: null,
  };
}

function withComputedFields(entry) {
  const registrarMetadata = resolveRegistrarMetadata(entry);
  return {
    ...entry,
    ...registrarMetadata,
    price_note: buildPriceNote(entry),
  };
}

function getAllTldPricing(options = {}) {
  if (!options.includeAllRootTlds) {
    return tldMetadata.map(withComputedFields);
  }

  const byTld = new Map(tldMetadata.map((entry) => [entry.tld, entry]));
  return [...getRootTlds()]
    .sort()
    .map((tld) => withComputedFields(byTld.get(tld) || createPlaceholderEntry(tld)));
}

function getKnownTlds() {
  return new Set(tldMetadata.map((entry) => entry.tld));
}

function getTldPricing(options = {}) {
  const explicitTlds = options.tlds ? normalizeTlds(options.tlds, []) : null;
  const maxPrice =
    options.maxPrice === undefined || options.maxPrice === null
      ? null
      : Number(options.maxPrice);

  let items = getAllTldPricing({ includeAllRootTlds: Boolean(options.all) });

  if (explicitTlds && explicitTlds.length > 0) {
    const byTld = new Map(items.map((entry) => [entry.tld, entry]));
    items = explicitTlds.map((tld) => {
      const entry = byTld.get(tld);
      return entry || withComputedFields(createPlaceholderEntry(tld));
    });
  } else if (!options.all && maxPrice !== null) {
    items = items.filter((entry) => entry.annual_price_usd !== null && entry.annual_price_usd <= maxPrice);
  }

  items.sort((a, b) => {
    const aPrice = a.annual_price_usd === null ? Number.POSITIVE_INFINITY : a.annual_price_usd;
    const bPrice = b.annual_price_usd === null ? Number.POSITIVE_INFINITY : b.annual_price_usd;
    return aPrice - bPrice || a.tld.localeCompare(b.tld);
  });

  return {
    kind: "prices",
    all: Boolean(options.all),
    maxPrice,
    items,
    price_note:
      items[0]?.price_note ||
      "Bundled pricing metadata is advisory and may now be out of date.",
  };
}

function resolveSearchTlds(options = {}) {
  if (options.tlds) {
    return normalizeTlds(options.tlds, []);
  }

  if (options.all || options.maxPrice !== undefined) {
    return getTldPricing({
      all: options.all,
      maxPrice: options.maxPrice,
    }).items
      .filter((entry) => entry.tld)
      .map((entry) => entry.tld);
  }

  return null;
}

function renderRegistrationUrl(option, domain) {
  if (!option) return null;
  if (option.url) return option.url;
  if (!option.url_template) return null;
  return option.url_template.replaceAll("{domain}", encodeURIComponent(domain));
}

function findDirectRegistrationOption(options) {
  return options.find((option) => option?.url_template) || null;
}

function buildRegistrationNote(option) {
  if (!option) {
    return "No reliable bundled registration target is available for this TLD.";
  }

  if (option.kind === "registry_homepage") {
    return "No verified registrar search link is bundled for this TLD; using the official registry homepage.";
  }

  if (option.kind === "registry_register") {
    return "No verified registrar search link is bundled for this TLD; using the official registry registration page.";
  }

  return null;
}

function resolveRegistration(entry, domain) {
  const preferredProvider = entry?.preferred_registration_provider || null;
  const fallbackProvider = entry?.fallback_registration_provider || null;
  const options = entry?.registration_options || [];
  const option = options[0] || null;
  const fallbackOption =
    options.find((item) => item.provider === fallbackProvider && item.provider !== option?.provider) ||
    options.find((item) => item.provider !== option?.provider) ||
    null;
  const directOption = findDirectRegistrationOption(options);

  return {
    preferred_registration_provider: preferredProvider,
    fallback_registration_provider: fallbackProvider,
    registration_provider: option?.provider || null,
    registration_url: renderRegistrationUrl(option, domain),
    registration_kind: option?.kind || null,
    registration_source: option?.source_name || null,
    registration_source_url: option?.source_url || null,
    registration_verified_at: option?.verified_at || null,
    registration_note: buildRegistrationNote(option),
    direct_registration_provider: directOption?.provider || null,
    direct_registration_url: renderRegistrationUrl(directOption, domain),
    direct_registration_kind: directOption?.kind || null,
    direct_registration_source: directOption?.source_name || null,
    direct_registration_source_url: directOption?.source_url || null,
    direct_registration_verified_at: directOption?.verified_at || null,
    fallback_registration_url: renderRegistrationUrl(fallbackOption, domain),
    fallback_registration_kind: fallbackOption?.kind || null,
    fallback_registration_source: fallbackOption?.source_name || null,
    fallback_registration_source_url: fallbackOption?.source_url || null,
    fallback_registration_verified_at: fallbackOption?.verified_at || null,
  };
}

function enrichWithPricing(candidate) {
  const entry = getAllTldPricing().find((item) => item.tld === candidate.tld) ||
    withComputedFields(createPlaceholderEntry(candidate.tld));
  const registration = resolveRegistration(entry, candidate.domain);

  return {
    ...candidate,
    ...registration,
    price: entry?.annual_price_usd ?? null,
    price_updated_at: entry?.price_updated_at ?? null,
    price_source: entry
      ? {
          name: entry.price_source_name,
          url: entry.price_source_url,
        }
      : null,
    price_note: buildPriceNote(entry),
  };
}

module.exports = {
  enrichWithPricing,
  getTldPricing,
  getKnownTlds,
  resolveSearchTlds,
};
