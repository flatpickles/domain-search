const path = require("node:path");

const DEFAULT_HACK_TLDS = [
  "st",
  "re",
  "se",
  "it",
  "sh",
  "me",
  "in",
  "de",
  "is",
  "sk",
  "pe",
  "ne",
  "la",
  "am",
  "at",
  "es",
  "im",
  "io",
  "ai",
  "be",
  "pt",
];

const DEFAULT_MIXED_CREATIVE_TLDS = [
  "st",
  "re",
  "se",
  "it",
  "sh",
  "me",
  "in",
];

const DEFAULT_EXACT_TLDS = ["com"];

const AVAILABLE_PATTERNS = [
  /\bno match for\b/i,
  /\bnot found\b/i,
  /\bno entries found\b/i,
  /\bdomain not found\b/i,
  /\bno data found\b/i,
  /\bno object found\b/i,
  /\bstatus:\s*free\b/i,
  /\bquery returned 0 objects\b/i,
  /\bno information available about\b/i,
  /\bis available\b/i,
  /\bstatus:\s*available\b/i,
  /\bno matching record\b/i,
  /\bwas not found\b/i,
  /\bobject does not exist\b/i,
  /\bdomain you requested is not known\b/i,
  /\bno such domain\b/i,
  /\bno matching objects\b/i,
  /\bavailable for registration\b/i,
  /\bstatus:\s*not registered\b/i,
  /\bno entries found for the selected source\b/i,
  /\bno domain records were found\b/i,
  /\bthe queried object does not exist\b/i,
];

const REGISTERED_PATTERNS = [
  /\bdomain name:/i,
  /\bregistry domain id:/i,
  /\bregistrar:/i,
  /\bcreation date:/i,
  /\bcreated on:/i,
  /\bregistered on:/i,
  /\bregistry expiry date:/i,
  /\bname server:/i,
  /\bdomain status:/i,
  /\bregistrant /i,
  /\bregistrant name:/i,
  /\bsponsoring registrar:/i,
  /^domain:\s+\S+/im,
  /^status:\s+\S+/im,
  /^created:\s+\S+/im,
  /^expires:\s+\S+/im,
  /^expire date:\s+\S+/im,
  /^nserver:\s+\S+/im,
];

const WHOIS_HOST_OVERRIDES = {
  com: "whois.verisign-grs.com",
  net: "whois.verisign-grs.com",
};

const ENTITY_MAP = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
};

const BUNDLED_WORDS_PATH = path.join(__dirname, "..", "data", "words.txt");
const SYSTEM_WORDS_PATH = "/usr/share/dict/words";

module.exports = {
  AVAILABLE_PATTERNS,
  BUNDLED_WORDS_PATH,
  DEFAULT_EXACT_TLDS,
  DEFAULT_HACK_TLDS,
  DEFAULT_MIXED_CREATIVE_TLDS,
  ENTITY_MAP,
  REGISTERED_PATTERNS,
  SYSTEM_WORDS_PATH,
  WHOIS_HOST_OVERRIDES,
};
