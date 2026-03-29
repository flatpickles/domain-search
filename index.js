const {
  generateBrandableCandidates,
  generateHackCandidates,
  generateExactCandidates,
} = require("./lib/candidates");
const { fetchDescription } = require("./lib/descriptions");
const { formatResults } = require("./lib/formatters");
const { getTldPricing } = require("./lib/pricing");
const { checkCandidates, generateCandidates, searchDomains } = require("./lib/search");
const { checkDomain } = require("./lib/whois");

module.exports = {
  checkCandidates,
  generateCandidates,
  generateBrandableCandidates,
  getTldPricing,
  searchDomains,
  generateHackCandidates,
  generateExactCandidates,
  checkDomain,
  fetchDescription,
  formatResults,
};
