const {
  DEFAULT_EXACT_TLDS,
  DEFAULT_HACK_TLDS,
} = require("./constants");

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
  if (["st", "re", "se", "it", "sh", "me", "in"].includes(tld)) score += 14;
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

function interleaveByInitial(items) {
  const buckets = new Map();
  for (const item of items) {
    const key = item.word[0];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const letters = [...buckets.keys()].sort();
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

function generateHackCandidates(words, options = {}) {
  const tlds = normalizeTlds(options.tlds, DEFAULT_HACK_TLDS);
  const minLabelLength = Number(options.minLabelLength ?? 3);
  const maxDomainLength = Number(options.maxDomainLength ?? 10);
  const threshold = Number(options.scoreThreshold ?? 18);
  const bestByDomain = new Map();

  for (const word of words) {
    for (const tld of tlds) {
      if (!word.endsWith(tld)) continue;
      const label = word.slice(0, -tld.length);
      const domain = `${label}.${tld}`;
      if (label.length < minLabelLength) continue;
      if (domain.length > maxDomainLength) continue;
      const candidate = {
        mode: "hack",
        word,
        domain,
        label,
        tld,
        score: scoreHack(word, label, tld),
      };
      const previous = bestByDomain.get(domain);
      if (!previous || candidate.score > previous.score) {
        bestByDomain.set(domain, candidate);
      }
    }
  }

  return interleaveByInitial(
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
        word,
        domain: `${word}.${tld}`,
        label: word,
        tld,
        score: scoreExact(word),
      })),
    )
    .filter((candidate) => candidate.score >= threshold)
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
}

module.exports = {
  generateExactCandidates,
  generateHackCandidates,
  normalizeTlds,
};
