function groupResults(results) {
  const groups = new Map();

  for (const item of results) {
    const key = item.candidate_type === "brandable" ? "brandable" : "real_word";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return groups;
}

function groupByDomainShape(results) {
  return {
    exact: results.filter((item) => item.domain_shape === "exact"),
    creativeSuffix: results.filter((item) => item.domain_shape === "creative_suffix"),
  };
}

function groupByVerification(results) {
  const isUnknown = (item) => item.verification_status === "unknown_needs_registrar_check";
  const isRegistered = (item) => item.verification_status === "registered" || item.status === "REGISTERED";

  return {
    available: results.filter((item) => !isUnknown(item) && !isRegistered(item)),
    registered: results.filter(isRegistered),
    unknown: results.filter(isUnknown),
  };
}

function isRegisteredResult(item) {
  return item.verification_status === "registered" || item.status === "REGISTERED";
}

function formatDomainLabel(item, isRegistrarLink) {
  const directUrl = item.direct_registration_url || (isRegistrarLink ? item.registration_url : null);
  const actionUrl = !isRegisteredResult(item) ? directUrl : null;
  return actionUrl ? `[\`${item.domain}\`](${actionUrl})` : `\`${item.domain}\``;
}

function formatGenerateMarkdown(summary) {
  const tldList = (summary.tlds || []).map((tld) => `.${tld}`).join(", ");
  const lines = [
    summary.mode === "brandable"
      ? "# Generated Brandable .com Candidates"
      : summary.mode === "hack"
      ? "# Generated Creative Suffix Candidates"
      : summary.mode === "mixed"
        ? "# Generated Mixed Domain Candidates"
        : "# Generated Exact-TLD Candidates",
    "",
    `Generated ${summary.emitted} ranked candidates from a pool of ${summary.candidatePool} across ${tldList || "the configured TLD set"}.`,
  ];

  if (summary.price_note) {
    lines.push("", `> ${summary.price_note}`);
  }

  lines.push("");
  for (const item of summary.candidates) {
    const candidateLabel = item.candidate_type || item.domain_shape || "candidate";
    lines.push(
      `- \`${item.domain}\` from \`${item.input || item.word || item.label}\` (${candidateLabel}, score ${item.score})`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatResultLine(item) {
  const description = item.description || "Description unavailable.";
  const sourceLabel = item.word || item.input || item.label || item.domain;
  const sourceLink =
    item.description_source === "wiktionary" || item.description_source === "dictionaryapi"
      ? `[${sourceLabel}](${item.description_url || `https://en.wiktionary.org/wiki/${encodeURIComponent(sourceLabel)}`})`
      : `\`${sourceLabel}\``;
  const isRegistrarLink = item.registration_kind && item.registration_kind.startsWith("registrar_");
  const domainLabel = formatDomainLabel(item, isRegistrarLink);
  const directRegistration =
    item.direct_registration_provider && item.direct_registration_url && !isRegisteredResult(item)
      ? ` Register via [${item.direct_registration_provider}](${item.direct_registration_url}).`
      : "";
  const registration = item.registration_provider && item.registration_url
    ? item.direct_registration_url && item.direct_registration_url === item.registration_url
      ? ""
      : isRegistrarLink
        ? item.direct_registration_url
          ? ` Preferred registrar: [${item.registration_provider}](${item.registration_url}).`
          : ` Register via [${item.registration_provider}](${item.registration_url}).`
        : ` Official registry: [${item.registration_provider}](${item.registration_url}).`
    : "";
  const fallbackRegistration =
    item.fallback_registration_provider &&
    item.fallback_registration_url &&
    item.fallback_registration_provider !== item.registration_provider &&
    item.fallback_registration_provider !== item.direct_registration_provider
      ? ` Fallback: [${item.fallback_registration_provider}](${item.fallback_registration_url}).`
      : "";
  const registrationNote = item.registration_note ? ` ${item.registration_note}` : "";
  const price = item.price !== null && item.price !== undefined ? ` Renewal: $${item.price}/year.` : "";
  const typeLabel = item.candidate_type === "brandable" ? "brandable" : "real-word";
  const verificationHint = item.verification_hint ? ` ${item.verification_hint}` : "";

  return `- ${domainLabel} from ${sourceLink}: ${description} (${typeLabel}).${price}${directRegistration}${registration}${fallbackRegistration}${registrationNote}${verificationHint}`;
}

function formatGroupedResults(lines, title, items) {
  lines.push(`## ${title}`, "");

  for (const item of items) {
    lines.push(formatResultLine(item));
  }

  lines.push("");
}

function formatCheckMarkdown(summary) {
  const tldList = (summary.tlds || []).map((tld) => `.${tld}`).join(", ");
  const verificationGroups = groupByVerification(summary.results || []);
  const hasRegisteredResults = verificationGroups.registered.length > 0;
  const heading =
    hasRegisteredResults
      ? "# Checked Domains"
      : summary.mode === "brandable"
      ? "# Available Brandable .com Domains"
      : summary.mode === "hack"
      ? "# Available Creative Suffix Domains"
      : summary.mode === "mixed"
        ? "# Available Mixed Domain Results"
      : summary.mode === "exact"
        ? "# Available Exact-TLD Domains"
        : "# Checked Domains";
  const intro =
    `Checked ${summary.checked} candidates from ${summary.candidatePool} across ${tldList || "the configured TLD set"}. Found ${summary.available} available and ${summary.unknown} unknown.`;
  const lines = [heading, "", intro];

  if (summary.price_note) {
    lines.push("", `> ${summary.price_note}`);
  }

  if (summary.selection_policy) {
    const exactCount = summary.selected_counts?.exact ?? 0;
    const creativeCount = summary.selected_counts?.creative_suffix ?? 0;
    const policyLabel =
      summary.selection_policy === "soft_shape_balance"
        ? `Selected with soft shape balance: ${exactCount} exact and ${creativeCount} creative suffix results.`
        : `Selected with score-only ranking: ${exactCount} exact and ${creativeCount} creative suffix results.`;
    lines.push("", policyLabel);
  }

  if (summary.kind === "search") {
    const truncatedLabel = summary.search_truncated ? "yes" : "no";
    lines.push(
      "",
      `Search truncated: ${truncatedLabel}. Checked ${summary.checked} candidates with a max search budget of ${summary.max_checks_applied}; ${summary.remaining_candidates} ranked candidates remain unchecked.`,
    );
  }

  lines.push("");
  if (verificationGroups.unknown.length > 0 || verificationGroups.registered.length > 0) {
    if (verificationGroups.available.length > 0) {
      lines.push("## Available Results", "");
      for (const item of verificationGroups.available) {
        lines.push(formatResultLine(item));
      }
      lines.push("");
    }

    if (verificationGroups.registered.length > 0) {
      lines.push("## Registered Results", "");
      for (const item of verificationGroups.registered) {
        lines.push(formatResultLine(item));
      }
      lines.push("");
    }

    if (verificationGroups.unknown.length > 0) {
      lines.push("## Unknown Results Needing Registrar Verification", "");
      for (const item of verificationGroups.unknown) {
        lines.push(formatResultLine(item));
      }
    }
    return `${lines.join("\n").trimEnd()}\n`;
  }

  const grouped = groupResults(summary.results);
  const shapeGroups = groupByDomainShape(summary.results);
  if (summary.mode === "mixed" && shapeGroups.exact.length > 0 && shapeGroups.creativeSuffix.length > 0) {
    formatGroupedResults(lines, "Best .com / Exact Hits", shapeGroups.exact);
    formatGroupedResults(lines, "Best Creative Suffix / Domain Hack Hits", shapeGroups.creativeSuffix);
    return `${lines.join("\n").trimEnd()}\n`;
  }

  const realWords = grouped.get("real_word") || [];
  const brandables = grouped.get("brandable") || [];

  if (realWords.length > 0 && brandables.length > 0) {
    formatGroupedResults(lines, "Best Real-Word / Natural Hits", realWords);
    formatGroupedResults(lines, "Best Brandable / Coined Hits", brandables);
    return `${lines.join("\n").trimEnd()}\n`;
  }

  for (const item of summary.results) {
    lines.push(formatResultLine(item));
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
    const registrationOption = item.registration_options?.[0] || null;
    const registrationSummary = registrationOption
      ? `${registrationOption.provider} (${registrationOption.kind})`
      : "none bundled";
    lines.push(
      `- \`.${item.tld}\`: ${price}/year via ${item.price_source_name || "unknown source"}. Preferred registrar: ${item.preferred_registration_provider || "unknown"}. Actionable registration target: ${registrationSummary}.`,
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
