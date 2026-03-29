const { generateExactCandidates, generateHackCandidates, normalizeTlds } = require("./candidates");
const { DEFAULT_EXACT_TLDS, DEFAULT_HACK_TLDS } = require("./constants");
const { fetchDefinition } = require("./definitions");
const { loadWords } = require("./words");
const { checkDomain } = require("./whois");

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

function resolveOptions(options = {}) {
  const mode = options.mode === "exact" ? "exact" : "hack";
  const fallbackTlds = mode === "exact" ? DEFAULT_EXACT_TLDS : DEFAULT_HACK_TLDS;
  const fetchDefinitions =
    options.fetchDefinitions ?? process.env.DOMAIN_SEARCH_DISABLE_DEFINITIONS !== "1";

  return {
    mode,
    tlds: normalizeTlds(options.tlds, fallbackTlds),
    limit: Number(options.limit ?? 100),
    minWordLength: Number(options.minWordLength ?? 5),
    maxWordLength: Number(options.maxWordLength ?? 10),
    minLabelLength: Number(options.minLabelLength ?? 3),
    maxDomainLength: Number(options.maxDomainLength ?? 10),
    concurrency: Number(options.concurrency ?? 4),
    maxChecks:
      options.maxChecks === undefined ? Number.POSITIVE_INFINITY : Number(options.maxChecks),
    wordsFile: options.wordsFile,
    fetchDefinitions,
  };
}

async function searchDomains(options = {}) {
  const resolved = resolveOptions(options);
  const words = loadWords(resolved);
  const candidates =
    resolved.mode === "exact"
      ? generateExactCandidates(words, resolved)
      : generateHackCandidates(words, resolved);
  const indexedCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    candidateIndex: index,
  }));
  const results = [];
  let checked = 0;
  const checkDomainFn = options.checkDomainFn || checkDomain;
  const fetchDefinitionFn = options.fetchDefinitionFn || fetchDefinition;

  await runPool(
    indexedCandidates,
    resolved.concurrency,
    async (candidate) => {
      if (results.length >= resolved.limit || checked >= resolved.maxChecks) return;

      const result = await checkDomainFn(candidate.domain, options);
      checked += 1;
      const status = typeof result === "string" ? result : result.status;

      if (status !== "AVAILABLE") return;

      let definition = null;
      if (resolved.fetchDefinitions) {
        definition = await fetchDefinitionFn(candidate.word, options);
      }

      results.push({
        ...candidate,
        definition: definition?.text || null,
        definitionSource:
          definition?.source ||
          `https://en.wiktionary.org/wiki/${encodeURIComponent(candidate.word)}`,
        status,
      });
    },
    () => results.length >= resolved.limit || checked >= resolved.maxChecks,
  );

  const orderedResults = results
    .sort((a, b) => a.candidateIndex - b.candidateIndex)
    .map(({ candidateIndex, ...candidate }) => candidate);

  return {
    mode: resolved.mode,
    tlds: resolved.tlds,
    checked,
    candidatePool: candidates.length,
    available: results.length,
    results: orderedResults.slice(0, resolved.limit),
  };
}

module.exports = {
  searchDomains,
};
