const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const skillPath = path.join(repoRoot, "skill", "SKILL.md");
const agentPromptPath = path.join(repoRoot, "skill", "agents", "openai.yaml");
const readmePath = path.join(repoRoot, "README.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("skill guidance keeps mixed as the default until the user explicitly asks otherwise", () => {
  const skill = read(skillPath);

  assert.match(skill, /If the user does not specify a TLD or domain style, use the default mixed search path:/);
  assert.match(skill, /Only override that mixed default when the user explicitly asks for a constraint such as `\.com` only, one specific TLD, or domain hacks only\./);
});

test("skill guidance requires split mixed-mode presentation", () => {
  const skill = read(skillPath);

  assert.match(skill, /When you use the default mixed search path, present the final results in two sections:/);
  assert.match(skill, /traditional exact domains/);
  assert.match(skill, /domain hacks/);
  assert.match(skill, /Do not rerank a mixed run into a mostly-`\.com` final list unless the user explicitly asked for that outcome\./);
});

test("agent prompt describes explicit overrides and split mixed-mode output", () => {
  const prompt = read(agentPromptPath);

  assert.match(prompt, /keep the built-in mixed default unless the user explicitly asks for \.com only, one specific TLD, or domain hacks only/);
  assert.match(prompt, /present the final answer in two sections: traditional exact domains and domain hacks/);
});

test("README documents mixed-by-default agent usage and .com-only override example", () => {
  const readme = read(readmePath);

  assert.match(readme, /the default should stay mixed unless the user explicitly asks for `\.com` only, a single TLD, or domain hacks only\./);
  assert.match(readme, /A good default is two sections:/);
  assert.match(readme, /Example explicit `\.com`-only search:/);
  assert.match(readme, /node bin\/domain-search\.js search --mode exact --words-file \.\/words\.txt --limit 20 --progress-format human/);
});

test("README and skill guidance document brandable mode and bounded search", () => {
  const readme = read(readmePath);
  const skill = read(skillPath);

  assert.match(readme, /Search now applies bounded progressive checking by default/);
  assert.match(readme, /`--mode brandable`/);
  assert.match(skill, /Use `--mode brandable` when the user explicitly wants shorter brandable `\.com` ideas from a supplied source list\./);
});

test("skill guidance prefers a short clean full-word-hack list over padded junk", () => {
  const skill = read(skillPath);
  const prompt = read(agentPromptPath);
  const readme = read(readmePath);

  assert.match(skill, /If confirmed-available full-word hacks are scarce, return fewer results and say so\./);
  assert.match(skill, /Do not pad with short suffix domains, phrase-like hacks, or coined non-`\.com` alternatives\./);
  assert.match(prompt, /If confirmed-available full-word hacks are scarce, say so and return fewer results rather than padding with short suffix domains or coined non-\.\s*com alternatives\./);
  assert.match(readme, /If the confirmed-available full-word hack pool is thin, return fewer results and say so instead of padding with short suffix domains or coined non-`\.com` alternatives\./);
});

test("skill and agent guidance forbid filler co/company names and arbitrary fake hacks", () => {
  const skill = read(skillPath);
  const prompt = read(agentPromptPath);

  assert.match(skill, /Do not hand-build exploratory shortlist names that just append corporate filler like `co`, `company`, `corp`, `inc`, `llc`, or `ltd`/);
  assert.match(skill, /do not invent non-`\.com` exact domains or coined non-`\.com` brandables like `steady\.st`, `equilia\.in`, or `steadia\.in`/i);
  assert.match(skill, /do not use `check` on agent-crafted non-`\.com` ideas; only check tool-generated candidates or a user-provided shortlist/i);
  assert.match(skill, /the label plus the TLD must read as a single ordinary word, for example `truck\.in` -> `truckin`/);
  assert.match(skill, /Do not relax this into a phrase, sentence fragment, or multiple-word reading/);
  assert.match(skill, /Reject examples like `tune\.me`, `level\.ed`, or `driftless\.in`/);
  assert.match(skill, /Reject splits like `trucks\.in`, `steady\.st`, or `anchor\.st`/);
  assert.match(skill, /return fewer results and say so\. Do not pad with short suffix domains, phrase-like hacks, or coined non-`\.com` alternatives/i);
  assert.match(prompt, /Do not force availability with filler endings like co or company/);
  assert.match(prompt, /do not invent non-\.\s*com exact domains or coined non-\.\s*com brandables/i);
  assert.match(prompt, /do not use check on agent-crafted non-\.\s*com ideas/i);
  assert.match(prompt, /the joined reading must be a single ordinary word, not a phrase or fragment/i);
  assert.match(prompt, /tune\.me, leveled\.in, driftless\.in, trucks\.in, steady\.st, or equilia\.in should be rejected/);
  assert.match(prompt, /return fewer results rather than padding with short suffix domains or coined non-\.\s*com alternatives/i);
});
