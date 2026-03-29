function formatMarkdown(summary) {
  const tldList = (summary.tlds || []).map((tld) => `.${tld}`).join(", ");
  const heading =
    summary.mode === "hack"
      ? "# Available Domain Hacks"
      : "# Available Exact-TLD Domains";
  const intro =
    summary.mode === "hack"
      ? `Scanned ${summary.checked} candidates from ${summary.candidatePool} generated across ${tldList || "the configured TLD set"}.`
      : `Scanned ${summary.checked} candidates from ${summary.candidatePool} generated across ${tldList || "the configured TLD set"}.`;
  const lines = [heading, "", intro, ""];

  let currentLetter = "";
  for (const item of [...summary.results].sort((a, b) => a.word.localeCompare(b.word))) {
    if (item.word[0] !== currentLetter) {
      currentLetter = item.word[0];
      lines.push(`## ${currentLetter.toUpperCase()}`, "");
    }
    const definition = item.definition || "Definition unavailable.";
    const source = item.definitionSource || `https://en.wiktionary.org/wiki/${encodeURIComponent(item.word)}`;
    lines.push(`- \`${item.domain}\` from [${item.word}](${source}): ${definition}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatResults(summary, options = {}) {
  const format = (options.format || summary.format || "markdown").toLowerCase();
  if (format === "json") {
    return `${JSON.stringify(summary, null, 2)}\n`;
  }
  return formatMarkdown(summary);
}

module.exports = {
  formatResults,
};
