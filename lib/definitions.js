const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { ENTITY_MAP } = require("./constants");

const execFileAsync = promisify(execFile);

function decodeHtml(text) {
  let output = text;
  for (const [entity, value] of Object.entries(ENTITY_MAP)) {
    output = output.split(entity).join(value);
  }
  output = output.replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)));
  output = output.replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCharCode(parseInt(value, 16)));
  return output;
}

function stripHtml(html) {
  return decodeHtml(
    html
      .replace(/<sup[\s\S]*?<\/sup>/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractDefinitionFromWiktionaryHtml(html) {
  const englishSection = html.match(/<h2 id="English">[\s\S]*$/);
  const source = englishSection ? englishSection[0] : html;
  const nounOrOther = source.match(
    /<h3 id="(?:Noun|Adjective|Verb|Adverb)">[\s\S]*?<ol><li>([\s\S]*?)<\/li>/,
  );
  if (!nounOrOther) return "";
  const firstSenseOnly = nounOrOther[1].split(/<(?:dl|ul)>/i)[0];
  return stripHtml(firstSenseOnly).replace(/\s*\[\s*edit\s*\]\s*/gi, "").trim();
}

async function fetchDefinition(word, options = {}) {
  const urlWord = encodeURIComponent(word);
  const fetchImpl = options.fetchImpl || global.fetch;
  const execFileFn = options.execFileFn || execFileAsync;

  try {
    const response = await fetchImpl(`https://api.dictionaryapi.dev/api/v2/entries/en/${urlWord}`);
    if (response.ok) {
      const payload = await response.json();
      const firstMeaning = payload?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if (firstMeaning) {
        return {
          text: firstMeaning.trim(),
          source: payload?.[0]?.sourceUrls?.[0] || `https://en.wiktionary.org/wiki/${urlWord}`,
        };
      }
    }
  } catch {}

  try {
    const { stdout } = await execFileFn("curl", [
      "-fsSL",
      "-A",
      "domain-search/0.1.0",
      `https://en.wiktionary.org/w/api.php?action=parse&page=${urlWord}&prop=text&formatversion=2&format=json`,
    ], {
      encoding: "utf8",
    });
    const payload = JSON.parse(stdout);
    const definition = extractDefinitionFromWiktionaryHtml(payload?.parse?.text || "");
    if (!definition) return null;
    return {
      text: definition,
      source: `https://en.wiktionary.org/wiki/${urlWord}`,
    };
  } catch {
    return null;
  }
}

module.exports = {
  fetchDefinition,
};
