function formatGenerateMarkdown(summary) {
  const tldList = (summary.tlds || []).map((tld) => `.${tld}`).join(", ");
  const lines = [
    summary.mode === "hack" ? "# Generated Domain Hack Candidates" : "# Generated Exact-TLD Candidates",
    "",
    `Generated ${summary.emitted} ranked candidates from a pool of ${summary.candidatePool} across ${tldList || "the configured TLD set"}.`,
  ];

  if (summary.price_note) {
    lines.push("", `> ${summary.price_note}`);
  }

  lines.push("");
  for (const item of summary.candidates) {
    lines.push(`- \`${item.domain}\` from \`${item.word}\` (score ${item.score})`);
  }

  return `${lines.join("\n")}\n`;
}

function formatCheckMarkdown(summary) {
  const tldList = (summary.tlds || []).map((tld) => `.${tld}`).join(", ");
  const heading =
    summary.mode === "hack"
      ? "# Available Domain Hacks"
      : summary.mode === "exact"
        ? "# Available Exact-TLD Domains"
        : "# Checked Domains";
  const intro =
    `Checked ${summary.checked} candidates from ${summary.candidatePool} across ${tldList || "the configured TLD set"}. Found ${summary.available} available and ${summary.unknown} unknown.`;
  const lines = [heading, "", intro];

  if (summary.price_note) {
    lines.push("", `> ${summary.price_note}`);
  }

  lines.push("");

  let currentLetter = "";
  for (const item of [...summary.results].sort((a, b) => a.word.localeCompare(b.word))) {
    if (item.word[0] !== currentLetter) {
      currentLetter = item.word[0];
      lines.push(`## ${currentLetter.toUpperCase()}`, "");
    }
    const definition = item.definition || "Definition unavailable.";
    const source =
      item.definitionSource || `https://en.wiktionary.org/wiki/${encodeURIComponent(item.word)}`;
    const registrar = item.registration_provider
      ? ` Register via [${item.registration_provider}](${item.registration_url}).`
      : "";
    const price = item.price !== null && item.price !== undefined ? ` Renewal: $${item.price}/year.` : "";
    lines.push(`- \`${item.domain}\` from [${item.word}](${source}): ${definition}${price}${registrar}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatPricesMarkdown(summary) {
  const lines = ["# Bundled TLD Pricing", ""];

  if (summary.price_note) {
    lines.push(`> ${summary.price_note}`, "");
  }

  for (const item of summary.items) {
    const price = item.annual_price_usd === null ? "unknown" : `$${item.annual_price_usd}`;
    lines.push(
      `- \`.${item.tld}\`: ${price}/year via ${item.price_source_name || "unknown source"}. Preferred registrar: ${item.preferred_registration_provider || "unknown"}. Fallback: ${item.fallback_registration_provider || "unknown"}.`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatResults(summary, options = {}) {
  const format = (options.format || summary.format || "markdown").toLowerCase();
  if (format === "json") {
    return `${JSON.stringify(summary, null, 2)}\n`;
  }

  if (summary.kind === "prices") return formatPricesMarkdown(summary);
  if (summary.kind === "generate") return formatGenerateMarkdown(summary);
  return formatCheckMarkdown(summary);
}

module.exports = {
  formatResults,
};
