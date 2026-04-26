const tldMetadata = require("../data/tlds.json");
const { normalizeTld } = require("./tlds");

const RESTRICTED_TLD_SCORE_PENALTY = -48;

function getTldMetadata(tld) {
  const normalized = normalizeTld(tld);
  if (!normalized) return null;
  return tldMetadata.find((entry) => entry.tld === normalized) || null;
}

function getRegistrationRestriction(tld) {
  return getTldMetadata(tld)?.registration_restriction || null;
}

function getTldScoreAdjustment(tld, options = {}) {
  if (!options.deemphasizeRestrictedTlds) return 0;
  return getRegistrationRestriction(tld) ? RESTRICTED_TLD_SCORE_PENALTY : 0;
}

module.exports = {
  getRegistrationRestriction,
  getTldMetadata,
  getTldScoreAdjustment,
  RESTRICTED_TLD_SCORE_PENALTY,
};
