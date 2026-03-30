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
  assert.match(skill, /Only override that mixed default when the user explicitly asks for a constraint such as `\.com` only, one specific TLD, or creative suffix domains only\./);
});

test("skill guidance requires split mixed-mode presentation", () => {
  const skill = read(skillPath);

  assert.match(skill, /When you use the default mixed search path, present the final results in two sections:/);
  assert.match(skill, /traditional exact domains/);
  assert.match(skill, /creative suffix domains/);
  assert.match(skill, /Do not rerank a mixed run into a mostly-`\.com` final list unless the user explicitly asked for that outcome\./);
});

test("agent prompt describes explicit overrides and split mixed-mode output", () => {
  const prompt = read(agentPromptPath);

  assert.match(prompt, /keep the built-in mixed default unless the user explicitly asks for \.com only, one specific TLD, or creative suffix domains only/);
  assert.match(prompt, /present the final answer in two sections: traditional exact domains and creative suffix domains/);
});

test("README documents mixed-by-default agent usage and .com-only override example", () => {
  const readme = read(readmePath);

  assert.match(readme, /the default should stay mixed unless the user explicitly asks for `\.com` only, a single TLD, or creative suffix domains only\./);
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

test("skill and agent guidance forbid filler co/company names and weak .it compounds", () => {
  const skill = read(skillPath);
  const prompt = read(agentPromptPath);

  assert.match(skill, /Do not hand-build exploratory shortlist names that just append corporate filler like `co`, `company`, `corp`, `inc`, `llc`, or `ltd`/);
  assert.match(skill, /Do not introduce weak `\*\.it` compounds manually/);
  assert.match(prompt, /Do not force availability with filler endings like co or company/);
  assert.match(prompt, /skip weak \.it compounds whose label does not stand on its own as a word/);
});
