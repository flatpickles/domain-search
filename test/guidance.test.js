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
