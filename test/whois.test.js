const test = require("node:test");
const assert = require("node:assert/strict");
const {
  checkDomain,
  classifyWhois,
} = require("../lib/whois");

test("classifyWhois detects available, registered, and unknown responses", () => {
  assert.equal(classifyWhois("No match for domain"), "AVAILABLE");
  assert.equal(classifyWhois("Domain Name: example.com"), "REGISTERED");
  assert.equal(classifyWhois(""), "UNKNOWN");
});

test("checkDomain routes .net through the verisign host override", async () => {
  let invocation = null;

  const result = await checkDomain("example.net", {
    execFileFn: async (command, args) => {
      invocation = { command, args };
      return { stdout: "No match for domain" };
    },
  });

  assert.equal(invocation.command, "whois");
  assert.deepEqual(invocation.args, ["-h", "whois.verisign-grs.com", "example.net"]);
  assert.equal(result.status, "AVAILABLE");
});
