const {
  applyTldScorePolicy,
  generateBrandableCandidates,
  generateExactCandidates,
  generateHackCandidates,
  isWholeWordHack,
  normalizeTlds,
  scoreExact,
  scoreHack,
  scoreBrandable,
} = require("./candidates");
const {
  DEFAULT_EXACT_TLDS,
  DEFAULT_HACK_TLDS,
  DEFAULT_MIXED_CREATIVE_TLDS,
} = require("./constants");
const { fetchDescription } = require("./descriptions");
const { enrichWithPricing, resolveSearchTlds } = require("./pricing");
const { assertKnownRootTlds } = require("./tlds");
const { buildWordSet, loadWords, normalizeAlphaWord, normalizeWords } = require("./words");
const { checkDomain, getDomainTld, normalizeDomain, validateDomain } = require("./whois");

const { loadSourceContext, applySourceContext } = require("./sources");
const DEFAULT_SEARCH_LIMIT = 20;

function resolveNonNegativeInteger(value, name, fallback) {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return numeric;
}

function resolvePositiveInteger(value, name, fallback) {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return numeric;
}

function assertSupportedVerificationTlds(tlds, context) {
  assertKnownRootTlds(tlds, context);
}

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

function intersectTlds(preferred, available) {
  if (!available) return preferred;
  const allowed = new Set(available);
  return preferred.filter((tld) => allowed.has(tld));
}

function mergeMixedCandidates(exactCandidates, creativeCandidates) {
  const exactSorted = [...exactCandidates].sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
  const creativeSorted = [...creativeCandidates].sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
  const merged = [];
  const seen = new Set();
  let exactIndex = 0;
  let creativeIndex = 0;

  while (exactIndex < exactSorted.length || creativeIndex < creativeSorted.length) {
    if (exactIndex < exactSorted.length) {
      const candidate = exactSorted[exactIndex];
      exactIndex += 1;
      if (!seen.has(candidate.domain)) {
        merged.push(candidate);
        seen.add(candidate.domain);
      }
    }

    if (creativeIndex < creativeSorted.length) {
      const candidate = creativeSorted[creativeIndex];
      creativeIndex += 1;
      if (!seen.has(candidate.domain)) {
        merged.push(candidate);
        seen.add(candidate.domain);
      }
    }
  }

  return merged;
}

function getVerificationMetadata(status) {
  if (status === "AVAILABLE") {
    return {
      verification_status: "available",
      verification_hint: null,
    };
  }

  if (status === "REGISTERED") {
    return {
      verification_status: "registered",
      verification_hint: "Already registered.",
    };
  }

  return {
    verification_status: "unknown_needs_registrar_check",
    verification_hint: "WHOIS inconclusive; verify on registrar before recommending purchase.",
  };
}

function getDomainShapeCounts(items) {
  return {
    exact: items.filter((item) => item.domain_shape === "exact").length,
    creative_suffix: items.filter((item) => item.domain_shape === "creative_suffix").length,
  };
}

function shouldSoftBalance(limit, items, mode) {
  if (!Number.isFinite(limit)) return false;
  if (mode === "exact" || mode === "hack" || mode === "brandable") return false;
  const counts = getDomainShapeCounts(items);
  return counts.exact > 0 && counts.creative_suffix > 0;
}

function getCreativeTldCap(limit) {
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.ceil(limit / 3));
}

function hasAlternativeCreativeTld(items, startIndex, seen, currentTld) {
  for (let index = startIndex + 1; index < items.length; index += 1) {
    const candidate = items[index];
    if (!candidate || seen.has(candidate.domain)) continue;
    if (candidate.domain_shape !== "creative_suffix") continue;
    if (candidate.tld !== currentTld) return true;
  }

  return false;
}

function canTakeCandidate(candidate, items, index, state) {
  if (state.seen.has(candidate.domain)) return false;
  if (candidate.domain_shape !== "creative_suffix") return true;

  const currentCount = state.creativeTldCounts.get(candidate.tld) || 0;
  if (currentCount < state.creativeTldCap) return true;

  return !hasAlternativeCreativeTld(items, index, state.seen, candidate.tld);
}

function pushSelectedCandidate(candidate, state) {
  state.selected.push(candidate);
  state.seen.add(candidate.domain);

  if (candidate.domain_shape === "creative_suffix") {
    state.creativeTldCounts.set(candidate.tld, (state.creativeTldCounts.get(candidate.tld) || 0) + 1);
  }
}

function selectFromSequence(items, state, limit, count = Number.POSITIVE_INFINITY) {
  let remaining = count;

  for (let index = 0; index < items.length; index += 1) {
    if (state.selected.length >= limit) break;
    if (remaining <= 0) break;

    const candidate = items[index];
    if (!canTakeCandidate(candidate, items, index, state)) continue;
    pushSelectedCandidate(candidate, state);
    remaining -= 1;
  }
}

function selectBalancedResults(items, limit, mode) {
  if (!Number.isFinite(limit)) {
    return {
      results: items,
      selectionPolicy: "score_only",
      selectedCounts: getDomainShapeCounts(items),
    };
  }

  const state = {
    selected: [],
    seen: new Set(),
    creativeTldCounts: new Map(),
    creativeTldCap: getCreativeTldCap(limit),
  };

  if (!shouldSoftBalance(limit, items, mode)) {
    selectFromSequence(items, state, limit);
    return {
      results: state.selected,
      selectionPolicy: "score_only",
      selectedCounts: getDomainShapeCounts(state.selected),
    };
  }

  const minimumPerShape = Math.max(1, Math.ceil(limit * 0.25));
  const exact = items.filter((item) => item.domain_shape === "exact");
  const creative = items.filter((item) => item.domain_shape === "creative_suffix");

  selectFromSequence(exact, state, limit, minimumPerShape);
  selectFromSequence(creative, state, limit, minimumPerShape);
  selectFromSequence(items, state, limit);

  return {
    results: state.selected,
    selectionPolicy: "soft_shape_balance",
    selectedCounts: getDomainShapeCounts(state.selected),
  };
}

function resolveMode(mode, hasExplicitTldScope) {
  if (mode !== undefined && mode !== null) {
    if (!["mixed", "exact", "hack", "brandable"].includes(mode)) {
      throw new Error("mode must be mixed, exact, hack, or brandable.");
    }
    return mode;
  }
  return hasExplicitTldScope ? "exact" : "mixed";
}

function resolveGenerateOptions(options = {}) {
  const requestedMode = options.mode ?? null;
  const resolvedTlds = resolveSearchTlds({
    tlds: options.tlds,
    maxPrice: options.maxPrice,
    all: options.all,
    tldLength: options.tldLength,
  });
  assertSupportedVerificationTlds(resolvedTlds, "generation");
  const hasExplicitTldScope = Boolean(options.tlds || options.all || options.tldLength != null);
  const mode = resolveMode(requestedMode, hasExplicitTldScope);
  const emitLimit =
    resolveNonNegativeInteger(options.emitLimit, "emitLimit", null);

  if (mode === "brandable" && options.tlds && normalizeTlds(options.tlds).some((tld) => tld !== "com")) {
    throw new Error("Brandable mode only supports .com output in v1.");
  }

  const exactTlds =
    mode === "mixed"
      ? intersectTlds(DEFAULT_EXACT_TLDS, resolvedTlds)
      : mode === "exact"
        ? hasExplicitTldScope ? normalizeTlds(resolvedTlds, DEFAULT_EXACT_TLDS) : intersectTlds(DEFAULT_EXACT_TLDS, resolvedTlds)
        : mode === "brandable"
          ? intersectTlds(["com"], resolvedTlds)
          : null;
  const creativeTlds =
    mode === "mixed"
      ? intersectTlds(DEFAULT_MIXED_CREATIVE_TLDS, resolvedTlds)
      : mode === "hack"
        ? hasExplicitTldScope ? normalizeTlds(resolvedTlds, DEFAULT_HACK_TLDS) : intersectTlds(DEFAULT_HACK_TLDS, resolvedTlds)
        : null;

  const explicitWords = Array.isArray(options.words) || options.wordsFile != null;
  const minWordLength = resolvePositiveInteger(options.minWordLength, "minWordLength", explicitWords ? 1 : 5);
  const maxWordLength = resolvePositiveInteger(options.maxWordLength, "maxWordLength", explicitWords ? 63 : 10);
  if (minWordLength > maxWordLength) throw new Error("minWordLength must not exceed maxWordLength.");
  return {
    requestedMode,
    mode,
    tlds: [...new Set([...(exactTlds || []), ...(creativeTlds || [])])],
    exactTlds,
    creativeTlds,
    minWordLength,
    maxWordLength,
    minLabelLength: resolvePositiveInteger(options.minLabelLength, "minLabelLength", explicitWords ? 1 : 3),
    maxDomainLength: resolvePositiveInteger(options.maxDomainLength, "maxDomainLength", mode === "hack" || mode === "mixed" ? 10 : Infinity),
    exactMaxDomainLength: resolvePositiveInteger(options.maxDomainLength, "maxDomainLength", Infinity),
    wordsFile: options.wordsFile,
    emitLimit,
    sourceWordSet: options.sourceWordSet || null,
    trustSourceWordsForHackValidation: Boolean(options.trustSourceWordsForHackValidation || options.wordsFile),
    deemphasizeRestrictedTlds: !options.tlds,
  };
}

function loadGenerateWords(options, resolved) {
  const hasExplicitWords = Array.isArray(options.words);
  const hasWordsFile = options.wordsFile !== undefined && options.wordsFile !== null;

  if (resolved.mode === "brandable" && !hasExplicitWords && !hasWordsFile) {
    throw new Error("Brandable mode requires explicit source words via --words-file or options.words.");
  }

  const words = hasExplicitWords
    ? normalizeWords(options.words, resolved)
    : loadWords(resolved);

  if (resolved.mode === "brandable" && words.length > 200) {
    throw new Error("Brandable mode supports at most 200 explicit source words.");
  }

  return words;
}

function withGeneratedMetadata(candidates, mode) {
  return candidates.map((candidate) => ({
    ...candidate,
    source_type: "wordlist",
    candidate_type: mode === "brandable" ? "brandable" : "real_word",
    input: candidate.word,
    description: null,
    description_source: "none",
  }));
}

function generateCandidates(options = {}) {
  const context = loadSourceContext(options);
  if (options.sourcesFile || options.sources) options = { ...options, words: [...context.records.keys()], trustSourceWordsForHackValidation: true };
  const resolved = resolveGenerateOptions(options);
  const words = loadGenerateWords(options, resolved);
  const hackSourceWordSet = resolved.trustSourceWordsForHackValidation
    ? buildWordSet(words)
    : resolved.sourceWordSet;
  const generated =
    resolved.mode === "exact"
      ? generateExactCandidates(words, { ...resolved, tlds: resolved.exactTlds })
      : resolved.mode === "hack"
        ? generateHackCandidates(words, { ...resolved, tlds: resolved.creativeTlds, sourceWordSet: hackSourceWordSet })
        : resolved.mode === "brandable"
          ? (resolved.exactTlds.length ? generateBrandableCandidates(words, resolved) : [])
          : mergeMixedCandidates(
              generateExactCandidates(words, { ...resolved, maxDomainLength: resolved.exactMaxDomainLength, tlds: resolved.exactTlds }),
              generateHackCandidates(words, { ...resolved, tlds: resolved.creativeTlds, sourceWordSet: hackSourceWordSet }),
            );
  const allCandidates = applySourceContext(withGeneratedMetadata(generated, resolved.mode), context);
  const emittedCandidates =
    resolved.emitLimit === null
      ? allCandidates
      : allCandidates.slice(0, resolved.emitLimit);

  return {
    kind: "generate",
    mode: resolved.mode,
    requested_mode: resolved.requestedMode,
    tlds: resolved.tlds,
    candidatePool: allCandidates.length,
    emitted: emittedCandidates.length,
    candidates: emittedCandidates,
    price_note: buildPriceNote(resolved.tlds),
  };
}

function inferModeFromTld(label, tld, fallbackMode = "exact") {
  if (DEFAULT_HACK_TLDS.includes(tld) && isWholeWordHack({ label, tld })) return "hack";
  return fallbackMode === "brandable" ? "brandable" : "exact";
}

function modeToDomainShape(mode) {
  return mode === "hack" ? "creative_suffix" : "exact";
}

function computeCandidateScore(label, mode, tld) {
  const normalizedLabel = normalizeAlphaWord(label);
  if (!normalizedLabel) return null;

  if (mode === "brandable") return scoreBrandable(normalizedLabel);
  if (mode === "hack") return scoreHack(`${normalizedLabel}${tld || ""}`, normalizedLabel, tld || "");
  return scoreExact(normalizedLabel);
}

function sortCandidatesForEvaluation(candidates) {
  return [...candidates].sort((a, b) => {
    const aScore = a.score === null || a.score === undefined ? Number.NEGATIVE_INFINITY : a.score;
    const bScore = b.score === null || b.score === undefined ? Number.NEGATIVE_INFINITY : b.score;
    const aKey = a.domain || a.input || a.label || "";
    const bKey = b.domain || b.input || b.label || "";
    return bScore - aScore || aKey.localeCompare(bKey);
  });
}

function normalizeProvidedCandidate(candidate, fallbackMode = "exact") {
  if (candidate === null || (typeof candidate !== "string" && (typeof candidate !== "object" || Array.isArray(candidate)))) {
    throw new Error("Each candidate must be a domain string or an object with a domain.");
  }
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    const domain = normalizeDomain(trimmed);
    const label = domain.includes(".") ? domain.slice(0, domain.lastIndexOf(".")) : domain;
    const tld = getDomainTld(domain);
    const inferredMode = inferModeFromTld(label, tld, fallbackMode);
    return {
      mode: inferredMode,
      input: trimmed,
      word: label,
      domain,
      label,
      tld,
      score: computeCandidateScore(label, inferredMode, tld),
      domain_shape: modeToDomainShape(inferredMode),
      source_type: "provided",
      candidate_type: "brandable",
      description: null,
      description_source: "none",
    };
  }

  const rawInput = candidate.input || candidate.domain || candidate.label || candidate.word;
  const hasDomain = Boolean(candidate.domain || (typeof rawInput === "string" && rawInput.includes(".")));
  const domain = hasDomain ? normalizeDomain(candidate.domain || rawInput) : null;
  // The actual domain is the authority for routing and registrar metadata.
  const label = domain ? domain.slice(0, domain.lastIndexOf(".")) : candidate.label || candidate.word || rawInput;
  const tld = domain ? getDomainTld(domain) : null;
  const explicitMode = candidate.mode || null;
  const explicitDomainShape = candidate.domain_shape || null;
  const resolvedMode =
    explicitMode ||
    (explicitDomainShape === "creative_suffix"
      ? "hack"
      : explicitDomainShape === "exact"
        ? fallbackMode === "brandable" ? "brandable" : "exact"
        : domain
          ? inferModeFromTld(label, tld, fallbackMode)
          : fallbackMode);
  const candidateType = candidate.candidate_type || (candidate.source_type === "wordlist" ? "real_word" : "brandable");
  const score =
    candidate.score ??
    computeCandidateScore(label, resolvedMode, tld);

  return {
    ...candidate,
    mode: resolvedMode,
    input: rawInput || label,
    word: candidate.word || label || null,
    domain,
    label,
    tld,
    score,
    domain_shape: explicitDomainShape || modeToDomainShape(resolvedMode),
    source_type: candidate.source_type || "provided",
    candidate_type: candidateType,
    description: candidate.description ?? null,
    description_source: candidate.description_source || (candidate.description ? "agent" : "none"),
  };
}

function normalizeCandidate(candidate, fallbackMode = "exact") {
  return normalizeProvidedCandidate(candidate, fallbackMode);
}

function emitProgress(options, event) {
  const stream = options.progressStream || process.stderr;
  const format = options.progressFormat || "human";

  if (format === "jsonl") {
    stream.write(`${JSON.stringify(event)}\n`);
    return;
  }

  const configuredMaxChecks =
    options.progressMaxChecks === undefined || options.progressMaxChecks === null
      ? options.maxChecks
      : options.progressMaxChecks;
  const maxChecks =
    configuredMaxChecks === undefined || configuredMaxChecks === null || !Number.isFinite(Number(configuredMaxChecks))
      ? "?"
      : String(Number(configuredMaxChecks));

  stream.write(
    `[domain-search] checked=${event.checked}/${maxChecks} available=${event.available} unknown=${event.unknown} registered=${event.registered} current=${event.domain} status=${event.status}\n`,
  );
}

async function evaluateCandidates(options = {}) {
  const fallbackMode =
    options.mode === "hack" ? "hack" : options.mode === "mixed" ? "exact" : "exact";
  const candidateIndexOffset = Number(options.candidateIndexOffset ?? 0);
  const seenDomains = new Set();
  const normalizedCandidates = (options.candidates || [])
    .map((candidate) => normalizeCandidate(candidate, fallbackMode))
    .map((candidate) => ({ ...candidate, domain: validateDomain(candidate.domain || "") }))
    .filter((candidate) => {
      if (seenDomains.has(candidate.domain)) return false;
      seenDomains.add(candidate.domain);
      return true;
    })
    .map((candidate) =>
      applyTldScorePolicy(candidate, {
        deemphasizeRestrictedTlds: options.deemphasizeRestrictedTlds !== false && !options.tlds,
      }),
    );
  assertSupportedVerificationTlds(
    normalizedCandidates.map((candidate) => candidate.tld).filter(Boolean),
    "candidate checking",
  );
  const shouldSortProvidedCandidates =
    options.sortProvidedCandidates !== false &&
    normalizedCandidates.length > 0 &&
    normalizedCandidates.every((candidate) => candidate.source_type !== "wordlist");
  const preparedCandidates = shouldSortProvidedCandidates
    ? sortCandidatesForEvaluation(normalizedCandidates)
    : normalizedCandidates;
  const candidates = preparedCandidates.map((candidate, index) => ({
    ...candidate,
    candidateIndex:
      candidate.candidateIndex === undefined || candidate.candidateIndex === null
        ? candidateIndexOffset + index
        : candidate.candidateIndex,
  }));
  const maxChecks = resolveNonNegativeInteger(options.maxChecks, "maxChecks", Number.POSITIVE_INFINITY);
  const availableGoal = resolveNonNegativeInteger(
    options.availableGoal,
    "availableGoal",
    Number.POSITIVE_INFINITY,
  );
  const seed = options.progressSeed || {
    checked: 0,
    available: 0,
    unknown: 0,
    registered: 0,
  };
  const concurrency = resolvePositiveInteger(options.concurrency, "concurrency", 4);
  const withDescriptions = Boolean(options.withDescriptions);
  const showUnknown = Boolean(options.showUnknown);
  const checkDomainFn = options.checkDomainFn || checkDomain;
  const fetchDescriptionFn = options.fetchDescriptionFn || fetchDescription;
  const results = [];
  const checks = [];
  let reservedChecks = 0;
  let activeGoalReservations = 0;
  let checked = 0;
  let available = 0;
  let unknown = 0;
  let registered = 0;

  function hasAvailableGoalCapacity() {
    return (
      !Number.isFinite(availableGoal) ||
      seed.available + available + activeGoalReservations < availableGoal
    );
  }

  function shouldStop() {
    return reservedChecks >= maxChecks || !hasAvailableGoalCapacity();
  }

  function reserveCheck(candidate) {
    if (!candidate.domain || shouldStop()) return null;

    reservedChecks += 1;
    const reservesAvailableGoal = Number.isFinite(availableGoal);
    if (reservesAvailableGoal) activeGoalReservations += 1;

    return { reservesAvailableGoal };
  }

  await runPool(
    candidates,
    concurrency,
    async (candidate) => {
      const reservation = reserveCheck(candidate);
      if (!reservation) return;

      let whoisResult;
      try {
        whoisResult = await checkDomainFn(candidate.domain, options);
      } finally {
        if (reservation.reservesAvailableGoal) {
          activeGoalReservations -= 1;
        }
      }
      const status = typeof whoisResult === "string" ? whoisResult : whoisResult.status;
      const checkedAt = new Date().toISOString();
      const check = { domain: candidate.domain, status, checked_at: checkedAt,
        ...(typeof whoisResult === "object" ? { verification_source: whoisResult.verification_source, unknown_reason: whoisResult.unknown_reason } : {}) };
      checks.push({ ...check, candidateIndex: candidate.candidateIndex });
      await options.onCheck?.(check);
      checked += 1;

      if (status === "AVAILABLE") available += 1;
      if (status === "UNKNOWN") unknown += 1;
      if (status === "REGISTERED") registered += 1;

      if ((options.progressFormat || "human") !== "silent") {
        emitProgress(options, {
          checked: seed.checked + checked,
          available: seed.available + available,
          unknown: seed.unknown + unknown,
          registered: seed.registered + registered,
          domain: candidate.domain,
          status,
        });
      }

      if (!options.showAll && status !== "AVAILABLE" && !(showUnknown && status === "UNKNOWN")) {
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
          ...check,
          ...getVerificationMetadata(status),
          description,
          description_source: descriptionSource,
          description_url: descriptionUrl,
        }),
      );
    },
    shouldStop,
  );

  return {
    candidates,
    checked,
    available,
    unknown,
    registered,
    checks: checks.sort((a, b) => a.candidateIndex - b.candidateIndex).map(({candidateIndex, ...check}) => check),
    results: results.sort((a, b) => a.candidateIndex - b.candidateIndex),
  };
}

function resolveSummaryMode(mode) {
  return mode === "hack" || mode === "exact" || mode === "mixed" || mode === "brandable"
    ? mode
    : null;
}

async function checkCandidates(options = {}) {
  resolveMode(options.mode, false);
  const limit = resolveNonNegativeInteger(options.limit, "limit", Number.POSITIVE_INFINITY);
  const evaluated = await evaluateCandidates(options);
  const selected = selectBalancedResults(
    evaluated.results,
    limit,
    options.mode === "mixed" ? "mixed" : options.mode || null,
  );

  return {
    kind: "check",
    mode: resolveSummaryMode(options.mode),
    tlds: [...new Set(evaluated.candidates.map((candidate) => candidate.tld).filter(Boolean))],
    checked: evaluated.checked,
    candidatePool: evaluated.candidates.length,
    available: evaluated.available,
    unknown: evaluated.unknown,
    registered: evaluated.registered,
    checks: evaluated.checks,
    remaining_candidates: evaluated.candidates.length - evaluated.checked,
    search_truncated: evaluated.checked < evaluated.candidates.length,
    max_checks_applied: Math.min(evaluated.candidates.length, resolveNonNegativeInteger(options.maxChecks, "maxChecks", Infinity)),
    stop_reason: evaluated.checked < evaluated.candidates.length ? "max_checks" : "exhausted",
    results: selected.results.map(({ candidateIndex, ...candidate }) => candidate),
    selection_policy: selected.selectionPolicy,
    selected_counts: selected.selectedCounts,
    price_note: buildPriceNote([...new Set(evaluated.candidates.map((candidate) => candidate.tld).filter(Boolean))]),
  };
}

function resolveSearchBudgets(options, candidatePool, mode) {
  const explicitMaxChecks = resolveNonNegativeInteger(options.maxChecks, "maxChecks", null);
  const limit = resolveNonNegativeInteger(options.limit, "limit", Number.POSITIVE_INFINITY);
  const planningLimit = Number.isFinite(limit) ? limit : DEFAULT_SEARCH_LIMIT;

  if (mode === "mixed") {
    const automaticHardCap = Math.max(planningLimit * 24, 240);
    return {
      initialWindow: Math.max(planningLimit * 5, 40),
      refillChunk: Math.max(planningLimit * 2, 20),
      burst: Math.max(1, Math.min(5, Math.ceil(planningLimit / 4))),
      maxChecksApplied: Math.min(candidatePool, explicitMaxChecks ?? automaticHardCap),
    };
  }

  const automaticHardCap = Math.max(planningLimit * 20, 200);
  return {
    initialWindow: Math.max(planningLimit * 8, 80),
    refillChunk: Math.max(planningLimit * 3, 30),
    maxChecksApplied: Math.min(candidatePool, explicitMaxChecks ?? automaticHardCap),
  };
}

function takeSlice(items, start, size) {
  if (start >= items.length || size <= 0) return [];
  return items.slice(start, start + size);
}

function buildSearchBatches(candidates, mode, budgets) {
  if (mode !== "mixed") {
    const batches = [];
    let index = 0;
    let size = budgets.initialWindow;

    while (index < candidates.length) {
      const batch = takeSlice(candidates, index, size);
      if (batch.length === 0) break;
      batches.push(batch);
      index += batch.length;
      size = budgets.refillChunk;
    }

    return batches;
  }

  const exact = candidates.filter((candidate) => candidate.domain_shape === "exact");
  const creative = candidates.filter((candidate) => candidate.domain_shape === "creative_suffix");
  const batches = [];
  let exactIndex = 0;
  let creativeIndex = 0;
  const exactInitialEnd = Math.min(exact.length, budgets.initialWindow);
  const creativeInitialEnd = Math.min(creative.length, budgets.initialWindow);

  while (exactIndex < exactInitialEnd || creativeIndex < creativeInitialEnd) {
    const exactBatch = takeSlice(exact, exactIndex, budgets.burst);
    if (exactBatch.length > 0) {
      batches.push(exactBatch);
      exactIndex += exactBatch.length;
    }

    const creativeBatch = takeSlice(creative, creativeIndex, budgets.burst);
    if (creativeBatch.length > 0) {
      batches.push(creativeBatch);
      creativeIndex += creativeBatch.length;
    }
  }

  while (exactIndex < exact.length || creativeIndex < creative.length) {
    const exactBatch = takeSlice(exact, exactIndex, budgets.refillChunk);
    if (exactBatch.length > 0) {
      batches.push(exactBatch);
      exactIndex += exactBatch.length;
    }

    const creativeBatch = takeSlice(creative, creativeIndex, budgets.refillChunk);
    if (creativeBatch.length > 0) {
      batches.push(creativeBatch);
      creativeIndex += creativeBatch.length;
    }
  }

  return batches;
}

async function searchDomains(options = {}) {
  const generated = options.generated || generateCandidates(options);
  const rankedCandidates = generated.candidates.map((candidate, index) => ({
    ...candidate,
    candidateIndex: index,
  }));
  const limit = resolveNonNegativeInteger(options.limit, "limit", Number.POSITIVE_INFINITY);
  const budgets = resolveSearchBudgets(options, rankedCandidates.length, generated.mode);
  const batches = buildSearchBatches(rankedCandidates, generated.mode, budgets);
  const aggregate = {
    checked: 0,
    available: 0,
    unknown: 0,
    registered: 0,
    results: [],
    checks: [],
  };

  for (const batch of batches) {
    if (aggregate.checked >= budgets.maxChecksApplied) break;
    if (Number.isFinite(limit) && aggregate.available >= limit) break;

    const evaluated = await evaluateCandidates({
      ...options,
      mode: generated.mode,
      candidates: batch,
      maxChecks: budgets.maxChecksApplied - aggregate.checked,
      availableGoal: Number.isFinite(limit) ? limit : undefined,
      progressSeed: {
        checked: aggregate.checked,
        available: aggregate.available,
        unknown: aggregate.unknown,
        registered: aggregate.registered,
      },
      progressMaxChecks: budgets.maxChecksApplied,
    });

    aggregate.checked += evaluated.checked;
    aggregate.available += evaluated.available;
    aggregate.unknown += evaluated.unknown;
    aggregate.registered += evaluated.registered;
    aggregate.results.push(...evaluated.results);
    aggregate.checks.push(...evaluated.checks);
  }

  const orderedResults = aggregate.results
    .sort((a, b) => a.candidateIndex - b.candidateIndex);
  const selected = selectBalancedResults(
    orderedResults,
    limit,
    generated.mode,
  );
  const remainingCandidates = Math.max(0, rankedCandidates.length - aggregate.checked);
  const searchTruncated =
    remainingCandidates > 0 &&
    (aggregate.checked >= budgets.maxChecksApplied || (Number.isFinite(limit) && aggregate.available >= limit));

  return {
    kind: "search",
    mode: generated.mode,
    requested_mode: generated.requested_mode,
    tlds: generated.tlds,
    checked: aggregate.checked,
    candidatePool: generated.candidatePool,
    generated: generated.emitted,
    available: aggregate.available,
    unknown: aggregate.unknown,
    registered: aggregate.registered,
    checks: aggregate.checks,
    results: selected.results.map(({ candidateIndex, ...candidate }) => candidate),
    selection_policy: selected.selectionPolicy,
    selected_counts: selected.selectedCounts,
    price_note: generated.price_note,
    search_truncated: searchTruncated,
    remaining_candidates: remainingCandidates,
    max_checks_applied: budgets.maxChecksApplied,
    stop_reason: remainingCandidates === 0 ? "exhausted" : Number.isFinite(limit) && aggregate.available >= limit ? "result_limit" : "max_checks",
  };
}

module.exports = {
  checkCandidates,
  generateCandidates,
  normalizeCandidate,
  searchDomains,
};
