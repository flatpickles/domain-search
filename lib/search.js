const {
  generateExactCandidates,
  generateHackCandidates,
  normalizeTlds,
  scoreBrandable,
} = require("./candidates");
const { DEFAULT_EXACT_TLDS, DEFAULT_HACK_TLDS } = require("./constants");
const { fetchDescription } = require("./descriptions");
const { enrichWithPricing, resolveSearchTlds } = require("./pricing");
const { loadWords, normalizeWords } = require("./words");
const { checkDomain, getDomainTld, normalizeDomain } = require("./whois");

async function runPool(items, concurrency, worker, shouldStop) {
  let index = 0;

  async function runner() {
    while (index < items.length) {
      if (shouldStop()) return;
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }

  const tasks = [];
  for (let i = 0; i < concurrency; i += 1) {
    tasks.push(runner());
  }
  await Promise.all(tasks);
}

function buildPriceNote(tlds) {
  if (!tlds || tlds.length === 0) return null;
  return "Bundled TLD prices were updated as of 2026-03-29 and may now be out of date. Coverage is incomplete and advisory.";
}

function resolveGenerateOptions(options = {}) {
  const mode = options.mode === "exact" ? "exact" : "hack";
  const fallbackTlds = mode === "exact" ? DEFAULT_EXACT_TLDS : DEFAULT_HACK_TLDS;
  const resolvedTlds = resolveSearchTlds({
    tlds: options.tlds,
    maxPrice: options.maxPrice,
    all: options.all,
  });
  const emitLimit =
    options.emitLimit === undefined || options.emitLimit === null
      ? null
      : Number(options.emitLimit);

  return {
    mode,
    tlds: normalizeTlds(resolvedTlds || fallbackTlds, fallbackTlds),
    minWordLength: Number(options.minWordLength ?? 5),
    maxWordLength: Number(options.maxWordLength ?? 10),
    minLabelLength: Number(options.minLabelLength ?? 3),
    maxDomainLength: Number(options.maxDomainLength ?? 10),
    wordsFile: options.wordsFile,
    emitLimit,
  };
}

function withGeneratedMetadata(candidates) {
  return candidates.map((candidate) => ({
    ...candidate,
    source_type: "wordlist",
    candidate_type: "real_word",
    input: candidate.word,
    description: null,
    description_source: "none",
  }));
}

function generateCandidates(options = {}) {
  const resolved = resolveGenerateOptions(options);
  const words = Array.isArray(options.words)
    ? normalizeWords(options.words, resolved)
    : loadWords(resolved);
  const generated =
    resolved.mode === "exact"
      ? generateExactCandidates(words, resolved)
      : generateHackCandidates(words, resolved);
  const allCandidates = withGeneratedMetadata(generated);
  const emittedCandidates =
    resolved.emitLimit === null
      ? allCandidates
      : allCandidates.slice(0, resolved.emitLimit);

  return {
    kind: "generate",
    mode: resolved.mode,
    tlds: resolved.tlds,
    candidatePool: allCandidates.length,
    emitted: emittedCandidates.length,
    candidates: emittedCandidates,
    price_note: buildPriceNote(resolved.tlds),
  };
}

function normalizeProvidedCandidate(candidate, fallbackMode = "exact") {
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    const domain = normalizeDomain(trimmed);
    const label = domain.includes(".") ? domain.slice(0, domain.lastIndexOf(".")) : domain;
    return {
      mode: fallbackMode,
      input: trimmed,
      word: label,
      domain,
      label,
      tld: getDomainTld(domain),
      score: scoreBrandable(label),
      source_type: "provided",
      candidate_type: "brandable",
      description: null,
      description_source: "none",
    };
  }

  const rawInput = candidate.input || candidate.domain || candidate.label || candidate.word;
  const hasDomain = Boolean(candidate.domain || (typeof rawInput === "string" && rawInput.includes(".")));
  const domain = hasDomain ? normalizeDomain(candidate.domain || rawInput) : null;
  const label =
    candidate.label ||
    (domain && domain.includes(".") ? domain.slice(0, domain.lastIndexOf(".")) : candidate.word || rawInput);
  const candidateType = candidate.candidate_type || (candidate.source_type === "wordlist" ? "real_word" : "brandable");
  const score =
    candidate.score ??
    (candidateType === "brandable" && label ? scoreBrandable(String(label).toLowerCase()) : null);

  return {
    ...candidate,
    mode: candidate.mode || fallbackMode,
    input: rawInput || label,
    word: candidate.word || label || null,
    domain,
    label,
    tld: candidate.tld || (domain ? getDomainTld(domain) : null),
    score,
    source_type: candidate.source_type || "provided",
    candidate_type: candidateType,
    description: candidate.description ?? null,
    description_source: candidate.description_source || (candidate.description ? "agent" : "none"),
  };
}

function normalizeCandidate(candidate, fallbackMode = "exact") {
  if (candidate && candidate.source_type === "wordlist") {
    return {
      ...candidate,
      input: candidate.input || candidate.word || candidate.label,
      description: candidate.description ?? null,
      description_source: candidate.description_source || "none",
      candidate_type: candidate.candidate_type || "real_word",
    };
  }

  return normalizeProvidedCandidate(candidate, fallbackMode);
}

function emitProgress(options, event) {
  const stream = options.progressStream || process.stderr;
  const format = options.progressFormat || "human";

  if (format === "jsonl") {
    stream.write(`${JSON.stringify(event)}\n`);
    return;
  }

  const maxChecks =
    options.maxChecks === undefined || options.maxChecks === null || !Number.isFinite(Number(options.maxChecks))
      ? "?"
      : String(Number(options.maxChecks));

  stream.write(
    `[domain-search] checked=${event.checked}/${maxChecks} available=${event.available} unknown=${event.unknown} registered=${event.registered} current=${event.domain} status=${event.status}\n`,
  );
}

async function checkCandidates(options = {}) {
  const candidates = (options.candidates || []).map((candidate, index) => ({
    ...normalizeCandidate(candidate, options.mode === "hack" ? "hack" : "exact"),
    candidateIndex: index,
  }));
  const limit =
    options.limit === undefined || options.limit === null
      ? Number.POSITIVE_INFINITY
      : Number(options.limit);
  const maxChecks =
    options.maxChecks === undefined || options.maxChecks === null
      ? Number.POSITIVE_INFINITY
      : Number(options.maxChecks);
  const concurrency = Number(options.concurrency ?? 4);
  const withDescriptions = Boolean(options.withDescriptions);
  const showUnknown = Boolean(options.showUnknown);
  const checkDomainFn = options.checkDomainFn || checkDomain;
  const fetchDescriptionFn = options.fetchDescriptionFn || fetchDescription;
  const results = [];
  let checked = 0;
  let available = 0;
  let unknown = 0;
  let registered = 0;

  await runPool(
    candidates,
    concurrency,
    async (candidate) => {
      if (results.length >= limit || checked >= maxChecks) return;
      if (!candidate.domain) return;

      const whoisResult = await checkDomainFn(candidate.domain, options);
      const status = typeof whoisResult === "string" ? whoisResult : whoisResult.status;
      checked += 1;

      if (status === "AVAILABLE") available += 1;
      if (status === "UNKNOWN") unknown += 1;
      if (status === "REGISTERED") registered += 1;

      if ((options.progressFormat || "human") !== "silent") {
        emitProgress(options, {
          checked,
          available,
          unknown,
          registered,
          domain: candidate.domain,
          status,
        });
      }

      if (status !== "AVAILABLE" && !(showUnknown && status === "UNKNOWN")) {
        return;
      }

      let description = candidate.description || null;
      let descriptionSource = candidate.description_source || (description ? "agent" : "none");
      let descriptionUrl = candidate.description_url || null;

      if (
        !description &&
        withDescriptions &&
        status === "AVAILABLE" &&
        candidate.candidate_type === "real_word" &&
        candidate.word
      ) {
        const fetched = await fetchDescriptionFn(candidate.word, options);
        if (fetched?.text) {
          description = fetched.text;
          descriptionSource = fetched.source_type || "wiktionary";
          descriptionUrl = fetched.source;
        }
      }

      results.push(
        enrichWithPricing({
          ...candidate,
          status,
          description,
          description_source: descriptionSource,
          description_url: descriptionUrl,
        }),
      );
    },
    () => results.length >= limit || checked >= maxChecks,
  );

  const orderedResults = results
    .sort((a, b) => a.candidateIndex - b.candidateIndex)
    .map(({ candidateIndex, ...candidate }) => candidate)
    .slice(0, limit);

  return {
    kind: "check",
    mode: options.mode === "hack" ? "hack" : options.mode === "exact" ? "exact" : null,
    tlds: [...new Set(candidates.map((candidate) => candidate.tld).filter(Boolean))],
    checked,
    candidatePool: candidates.length,
    available,
    unknown,
    registered,
    results: orderedResults,
    price_note: buildPriceNote([...new Set(candidates.map((candidate) => candidate.tld).filter(Boolean))]),
  };
}

async function searchDomains(options = {}) {
  const generated = generateCandidates(options);
  const checked = await checkCandidates({
    ...options,
    mode: generated.mode,
    candidates: generated.candidates,
  });

  return {
    ...checked,
    kind: "search",
    mode: generated.mode,
    tlds: generated.tlds,
    candidatePool: generated.candidatePool,
    generated: generated.emitted,
    price_note: generated.price_note,
  };
}

module.exports = {
  checkCandidates,
  generateCandidates,
  normalizeCandidate,
  searchDomains,
};
