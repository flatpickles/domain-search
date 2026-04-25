const fs = require("node:fs");
const {
  BUNDLED_WORDS_PATH,
  SYSTEM_WORDS_PATH,
} = require("./constants");

let knownWordSetCache = null;

function resolveWordsPath(wordsFile) {
  if (wordsFile === "-") return wordsFile;
  if (wordsFile) return wordsFile;
  if (fs.existsSync(BUNDLED_WORDS_PATH)) return BUNDLED_WORDS_PATH;
  if (fs.existsSync(SYSTEM_WORDS_PATH)) return SYSTEM_WORDS_PATH;
  throw new Error(
    "No word list found. Provide --words-file or add a fallback list to data/words.txt.",
  );
}

function normalizeWords(words, options = {}) {
  const minWordLength = Number(options.minWordLength ?? 5);
  const maxWordLength = Number(options.maxWordLength ?? 10);

  return [...new Set(
    words
      .map((word) => String(word).trim().toLowerCase())
      .filter((word) => /^[a-z]+$/.test(word))
      .filter((word) => word.length >= minWordLength && word.length <= maxWordLength),
  )];
}

function normalizeAlphaWord(word) {
  const normalized = String(word).trim().toLowerCase();
  return /^[a-z]+$/.test(normalized) ? normalized : null;
}

function buildWordSet(words) {
  return new Set(
    words
      .map((word) => normalizeAlphaWord(word))
      .filter(Boolean),
  );
}

function loadWords(options = {}) {
  const path = resolveWordsPath(options.wordsFile);
  const source =
    path === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(path, "utf8");

  return normalizeWords(source.split(/\r?\n/), options);
}

function loadKnownWordSet() {
  if (knownWordSetCache) return knownWordSetCache;

  const paths = [BUNDLED_WORDS_PATH, SYSTEM_WORDS_PATH].filter((filePath) => fs.existsSync(filePath));
  const words = [];

  for (const filePath of paths) {
    const fileWords = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const word of fileWords) {
      words.push(word);
    }
  }

  knownWordSetCache = buildWordSet(words);
  return knownWordSetCache;
}

function isKnownWord(word, extraWordSet) {
  const normalized = normalizeAlphaWord(word);
  if (!normalized) return false;
  if (extraWordSet && extraWordSet.has(normalized)) return true;
  return loadKnownWordSet().has(normalized);
}

module.exports = {
  buildWordSet,
  isKnownWord,
  loadWords,
  loadKnownWordSet,
  normalizeAlphaWord,
  normalizeWords,
  resolveWordsPath,
};
