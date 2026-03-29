const fs = require("node:fs");
const {
  BUNDLED_WORDS_PATH,
  SYSTEM_WORDS_PATH,
} = require("./constants");

function resolveWordsPath(wordsFile) {
  if (wordsFile) return wordsFile;
  if (fs.existsSync(BUNDLED_WORDS_PATH)) return BUNDLED_WORDS_PATH;
  if (fs.existsSync(SYSTEM_WORDS_PATH)) return SYSTEM_WORDS_PATH;
  throw new Error(
    "No word list found. Provide --words-file or add a fallback list to data/words.txt.",
  );
}

function loadWords(options = {}) {
  const path = resolveWordsPath(options.wordsFile);
  const minWordLength = Number(options.minWordLength ?? 5);
  const maxWordLength = Number(options.maxWordLength ?? 10);

  return [...new Set(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((word) => word.trim().toLowerCase())
      .filter((word) => /^[a-z]+$/.test(word))
      .filter((word) => word.length >= minWordLength && word.length <= maxWordLength),
  )];
}

module.exports = {
  loadWords,
  resolveWordsPath,
};
