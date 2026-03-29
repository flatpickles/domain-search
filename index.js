const {
  generateHackCandidates,
  generateExactCandidates,
} = require("./lib/candidates");
const { fetchDefinition } = require("./lib/definitions");
const { formatResults } = require("./lib/formatters");
const { searchDomains } = require("./lib/search");
const { checkDomain } = require("./lib/whois");

module.exports = {
  searchDomains,
  generateHackCandidates,
  generateExactCandidates,
  checkDomain,
  fetchDefinition,
  formatResults,
};
