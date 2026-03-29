const {
  generateHackCandidates,
  generateExactCandidates,
} = require("./lib/candidates");
const { fetchDefinition } = require("./lib/definitions");
const { formatResults } = require("./lib/formatters");
const { getTldPricing } = require("./lib/pricing");
const { checkCandidates, generateCandidates, searchDomains } = require("./lib/search");
const { checkDomain } = require("./lib/whois");

module.exports = {
  checkCandidates,
  generateCandidates,
  getTldPricing,
  searchDomains,
  generateHackCandidates,
  generateExactCandidates,
  checkDomain,
  fetchDefinition,
  formatResults,
};
