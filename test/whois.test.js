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

test("classifyWhois prefers authoritative registered sections over referred not-found tails", () => {
  const raw = `% IANA WHOIS server

# whois.nixiregistry.in
Domain Name: walk.in
Registry Domain ID: D414400000000620344-IN
Registrar: Key-Systems GmbH
Creation Date: 2016-04-07T20:02:30.060Z
Registry Expiry Date: 2026-04-07T20:02:30.060Z
Name Server: ns-cloud-e1.googledomains.com
Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited

# whois.rrpproxy.net
The queried object does not exist:
>>> Last update of WHOIS database: 2026-03-30T01:14:46Z <<<`;

  assert.equal(classifyWhois(raw), "REGISTERED");
});

test("classifyWhois keeps direct .in registry availability responses available", () => {
  const raw = `>>> Domain zqjxkqvnmrt.in is available for registration

>>> Please visit https://rdap.nixiregistry.in/registrars/ for a list of
accredited registrars

>>> Last update of WHOIS database: 2026-03-30T01:15:07.959Z <<<`;

  assert.equal(classifyWhois(raw), "AVAILABLE");
});

test("classifyWhois falls back to unknown for ambiguous mixed whois output", () => {
  const raw = `% IANA WHOIS server

# whois.example-registry.test
mystery registry response

# whois.example-registrar.test
The queried object does not exist:`;

  assert.equal(classifyWhois(raw), "UNKNOWN");
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

test("checkDomain routes .in through the nixi registry host override", async () => {
  let invocation = null;

  const result = await checkDomain("walk.in", {
    execFileFn: async (command, args) => {
      invocation = { command, args };
      return { stdout: ">>> Domain walk.in is available for registration" };
    },
  });

  assert.equal(invocation.command, "whois");
  assert.deepEqual(invocation.args, ["-h", "whois.nixiregistry.in", "walk.in"]);
  assert.equal(result.status, "AVAILABLE");
});

test("checkDomain routes .se through the registry host override", async () => {
  let invocation = null;

  const result = await checkDomain("clau.se", {
    execFileFn: async (command, args) => {
      invocation = { command, args };
      return {
        stdout: `state:            active
domain:           clau.se
created:          2013-11-20
expires:          2026-11-20
nserver:          ns01.one.com
status:           ok
registrar:        One.com`,
      };
    },
  });

  assert.equal(invocation.command, "whois");
  assert.deepEqual(invocation.args, ["-h", "whois.iis.se", "clau.se"]);
  assert.equal(result.status, "REGISTERED");
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
