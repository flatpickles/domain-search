const tldMetadata = require("../data/tlds.json");
const { normalizeTlds } = require("./candidates");

const REGISTRAR_SEARCH_URLS = {
  Namecheap: (domain) =>
    `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`,
};

function buildPriceNote(entry) {
  if (!entry) {
    return "No bundled pricing metadata is available for this TLD.";
  }

  return `Bundled pricing was updated as of ${entry.price_updated_at} from ${entry.price_source_name} and may now be out of date.`;
}

function getAllTldPricing() {
  return tldMetadata.map((entry) => ({
    ...entry,
    price_note: buildPriceNote(entry),
  }));
}

function getTldPricing(options = {}) {
  const explicitTlds = options.tlds ? normalizeTlds(options.tlds, []) : null;
  const maxPrice =
    options.maxPrice === undefined || options.maxPrice === null
      ? null
      : Number(options.maxPrice);

  let items = getAllTldPricing();

  if (explicitTlds && explicitTlds.length > 0) {
    const byTld = new Map(items.map((entry) => [entry.tld, entry]));
    items = explicitTlds.map((tld) => {
      const entry = byTld.get(tld);
      return (
        entry || {
          tld,
          annual_price_usd: null,
          price_updated_at: null,
          price_source_name: null,
          price_source_url: null,
          preferred_registration_provider: null,
          fallback_registration_provider: "Namecheap",
          price_note: buildPriceNote(null),
        }
      );
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

function resolveRegistration(entry, domain) {
  const preferredProvider = entry?.preferred_registration_provider || null;
  const fallbackProvider = entry?.fallback_registration_provider || "Namecheap";
  const registrationProvider =
    preferredProvider && REGISTRAR_SEARCH_URLS[preferredProvider]
      ? preferredProvider
      : fallbackProvider;
  const urlBuilder = REGISTRAR_SEARCH_URLS[registrationProvider] || REGISTRAR_SEARCH_URLS.Namecheap;

  return {
    preferred_registration_provider: preferredProvider,
    registration_provider: registrationProvider,
    registration_url: urlBuilder(domain),
  };
}

function enrichWithPricing(candidate) {
  const entry = getAllTldPricing().find((item) => item.tld === candidate.tld);
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
  resolveSearchTlds,
};
