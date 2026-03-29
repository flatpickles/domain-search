const test = require("node:test");
const assert = require("node:assert/strict");
const {
  checkDomain,
  classifyWhois,
  getDomainTld,
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

test("checkDomain reduces unknown responses for supported noisy TLDs", async () => {
  const meResult = await checkDomain("brandable.me", {
    execFileFn: async () => ({
      stdout: "Status: Not Registered",
    }),
  });
  const appResult = await checkDomain("brandable.app", {
    execFileFn: async () => ({
      stdout: "Google Registry\nDomain not found",
    }),
  });

  assert.equal(meResult.status, "AVAILABLE");
  assert.equal(appResult.status, "AVAILABLE");
});

test("getDomainTld returns the final label of a domain", () => {
  assert.equal(getDomainTld("example.com"), "com");
});
