const {
  DEFAULT_EXACT_TLDS,
  DEFAULT_HACK_TLDS,
} = require("./constants");
const { buildWordSet, isKnownWord, normalizeAlphaWord } = require("./words");

const BLOCKED_CORPORATE_SOURCE_WORDS = new Set(["company", "corp", "inc", "llc", "ltd"]);
const BLOCKED_CORPORATE_TAILS = ["company", "corp", "inc", "llc", "ltd"];

function normalizeTlds(tlds, fallback) {
  const source =
    typeof tlds === "string"
      ? tlds.split(",")
      : Array.isArray(tlds)
        ? tlds
        : fallback;

  return [...new Set(
    source
      .map((value) => String(value).trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean),
  )];
}

function scoreLabel(label) {
  let score = 0;
  const vowelCount = (label.match(/[aeiouy]/g) || []).length;
  if (label.length >= 4) score += 12;
  if (label.length >= 5) score += 8;
  if (/^[a-z]{3,6}$/.test(label)) score += 8;
  if (vowelCount >= 2) score += 6;
  if (vowelCount >= 3) score += 3;
  if (!/(.)\1/.test(label)) score += 2;
  if (!/[qxzj]/.test(label)) score += 3;
  if (/[aeiouy]$/.test(label)) score += 3;
  return score;
}

function scoreHack(word, label, tld) {
  let score = scoreLabel(label);
  if (["st", "sh", "re", "se"].includes(tld)) score += 12;
  if (["me", "in"].includes(tld)) score += 8;
  if (tld === "it") score += 4;
  if (["de", "pe", "is", "sk", "la"].includes(tld)) score += 8;
  if (/^(after|arch|alien|eleg|algor|alka|agel|astro|atav|apiar|acque)/.test(label)) score += 6;
  if (/(itis|osis|ine|ous|oid|ium|ase|ide)$/.test(word)) score -= 16;
  if (/(ably|edly|ally|ously|ingly)$/.test(word)) score -= 10;
  if (/^(anti|counter|inter|multi|non|over|post|pre|proto|pseudo|semi|sub|super|trans|ultra|under|un)/.test(word)) {
    score -= 8;
  }
  if (/[qxz]{2,}/.test(word)) score -= 6;
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(word)) score -= 7;
  if (/(.)\1\1/.test(word)) score -= 10;
  if (word.length <= 8) score += 6;
  return score;
}

function scoreExact(word) {
  let score = scoreLabel(word);
  if (word.length <= 8) score += 14;
  if (word.length <= 7) score += 8;
  if (/(ist|ast|ore|wist|wise|ward|ling|more|less)$/.test(word)) score += 5;
  if (/^(after|eleg|algor|alien|agel|archa|auster|ember|velvet|sable)/.test(word)) score += 5;
  if (/(itis|osis|ine|ous|oid|ium|ase|ide)$/.test(word)) score -= 16;
  if (/(ably|edly|ally|ously|ingly)$/.test(word)) score -= 10;
  if (/^(anti|counter|inter|multi|non|over|post|pre|proto|pseudo|semi|sub|super|trans|ultra|under|un)/.test(word)) {
    score -= 8;
  }
  if (/[qxz]{2,}/.test(word)) score -= 6;
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(word)) score -= 7;
  if (/(.)\1\1/.test(word)) score -= 10;
  return score;
}

function scoreBrandable(term) {
  let score = 0;
  const vowelCount = (term.match(/[aeiouy]/g) || []).length;
  if (term.length >= 4 && term.length <= 8) score += 20;
  if (term.length <= 10) score += 8;
  if (vowelCount >= 1 && vowelCount <= 3) score += 10;
  if (!/(.)\1\1/.test(term)) score += 6;
  if (!/(rr|zz|xx|qq|jj)$/.test(term)) score += 8;
  if (!/[qxz]{2,}/.test(term)) score += 5;
  if (!/[bcdfghjklmnpqrstvwxyz]{5,}/.test(term)) score += 6;
  if (/^[a-z]+$/.test(term)) score += 4;
  if (/[aeiouy]$/.test(term)) score += 2;
  if (/(rr|lyly|shly|zr|xr)$/.test(term)) score -= 10;
  if (/(.)\1$/.test(term)) score -= 8;
  return score;
}

function hasBlockedCorporateTail(label) {
  const normalized = normalizeAlphaWord(label);
  if (!normalized) return false;
  if (BLOCKED_CORPORATE_TAILS.some((tail) => normalized.endsWith(tail))) return true;
  return normalized.endsWith("co");
}

function isBlockedCorporateSourceWord(word) {
  const normalized = normalizeAlphaWord(word);
  return normalized ? BLOCKED_CORPORATE_SOURCE_WORDS.has(normalized) : false;
}

function isCandidateLabelAllowed(candidate, options = {}) {
  const label = normalizeAlphaWord(candidate.label || candidate.word);
  if (!label) return false;
  if (hasBlockedCorporateTail(label)) return false;

  if (candidate.domain_shape === "creative_suffix" && candidate.tld === "it") {
    return isKnownWord(label, options.sourceWordSet);
  }

  return true;
}

function interleaveByInitial(items) {
  const buckets = new Map();
  for (const item of items) {
    const key = item.word[0];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const letters = [...buckets.keys()];
  const output = [];
  let added = true;

  while (added) {
    added = false;
    for (const letter of letters) {
      const bucket = buckets.get(letter);
      if (!bucket || bucket.length === 0) continue;
      output.push(bucket.shift());
      added = true;
    }
  }

  return output;
}

function roundRobinBuckets(buckets) {
  const active = buckets
    .filter((bucket) => bucket.items.length > 0)
    .map((bucket) => ({
      key: bucket.key,
      items: [...bucket.items],
    }));
  const output = [];
  let added = true;

  while (added) {
    added = false;
    for (const bucket of active) {
      if (bucket.items.length === 0) continue;
      output.push(bucket.items.shift());
      added = true;
    }
  }

  return output;
}

function diversifyHackCandidates(items) {
  const buckets = new Map();

  for (const item of items) {
    if (!buckets.has(item.tld)) buckets.set(item.tld, []);
    buckets.get(item.tld).push(item);
  }

  return roundRobinBuckets(
    [...buckets.entries()].map(([key, bucketItems]) => ({
      key,
      items: interleaveByInitial(bucketItems),
    })),
  );
}

function generateBrandableCandidates(words, options = {}) {
  if (words.length > 200) {
    throw new Error("Brandable mode supports at most 200 explicit source words.");
  }

  const tokens = [...new Set(
    words
      .map((word) => String(word).trim().toLowerCase())
      .filter((word) => /^[a-z]+$/.test(word))
      .filter((word) => word.length >= 3 && word.length <= 8),
  )].filter((word) => !isBlockedCorporateSourceWord(word));
  const topTokens = [...tokens]
    .sort((a, b) => scoreLabel(b) - scoreLabel(a) || a.localeCompare(b))
    .slice(0, 24);
  const sourceSet = new Set(topTokens);
  const bestByDomain = new Map();

  function leftFragment(token) {
    return token.length <= 5 ? token : token.slice(0, 4);
  }

  function rightFragment(token) {
    return token.length <= 5 ? token : token.slice(-4);
  }

  for (const left of topTokens) {
    for (const right of topTokens) {
      if (left === right) continue;
      const label = `${leftFragment(left)}${rightFragment(right)}`;
      if (label.length < 6 || label.length > 10) continue;
      if (sourceSet.has(label)) continue;
      if (hasBlockedCorporateTail(label)) continue;
      if (/(.)\1\1/.test(label)) continue;
      if (/[bcdfghjklmnpqrstvwxyz]{5}/.test(label)) continue;

      const domain = `${label}.com`;
      const candidate = {
        mode: "brandable",
        domain_shape: "exact",
        word: label,
        domain,
        label,
        tld: "com",
        score: scoreBrandable(label),
        source_words: [left, right],
      };
      const previous = bestByDomain.get(domain);
      if (!previous || candidate.score > previous.score) {
        bestByDomain.set(domain, candidate);
      }
    }
  }

  return [...bestByDomain.values()]
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
}

function generateHackCandidates(words, options = {}) {
  const tlds = normalizeTlds(options.tlds, DEFAULT_HACK_TLDS);
  const minLabelLength = Number(options.minLabelLength ?? 3);
  const maxDomainLength = Number(options.maxDomainLength ?? 10);
  const threshold = Number(options.scoreThreshold ?? 18);
  const bestByDomain = new Map();
  const sourceWordSet = buildWordSet(words);

  for (const word of words) {
    for (const tld of tlds) {
      if (!word.endsWith(tld)) continue;
      const label = word.slice(0, -tld.length);
      const domain = `${label}.${tld}`;
      if (label.length < minLabelLength) continue;
      if (domain.length > maxDomainLength) continue;
      const candidate = {
        mode: "hack",
        domain_shape: "creative_suffix",
        word,
        domain,
        label,
        tld,
        score: scoreHack(word, label, tld),
      };
      if (!isCandidateLabelAllowed(candidate, { sourceWordSet })) continue;
      const previous = bestByDomain.get(domain);
      if (!previous || candidate.score > previous.score) {
        bestByDomain.set(domain, candidate);
      }
    }
  }

  return diversifyHackCandidates(
    [...bestByDomain.values()]
      .filter((candidate) => candidate.score >= threshold)
      .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain)),
  );
}

function generateExactCandidates(words, options = {}) {
  const tlds = normalizeTlds(options.tlds, DEFAULT_EXACT_TLDS);
  const threshold = Number(options.scoreThreshold ?? 22);

  return words
    .flatMap((word) =>
      tlds.map((tld) => ({
        mode: "exact",
        domain_shape: "exact",
        word,
        domain: `${word}.${tld}`,
        label: word,
        tld,
        score: scoreExact(word),
      })),
    )
    .filter((candidate) => isCandidateLabelAllowed(candidate))
    .filter((candidate) => candidate.score >= threshold)
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
}

module.exports = {
  generateExactCandidates,
  generateBrandableCandidates,
  generateHackCandidates,
  hasBlockedCorporateTail,
  isBlockedCorporateSourceWord,
  isCandidateLabelAllowed,
  normalizeTlds,
  scoreExact,
  scoreHack,
  scoreLabel,
  scoreBrandable,
};
