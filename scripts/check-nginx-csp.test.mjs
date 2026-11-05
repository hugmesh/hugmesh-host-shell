// Pins the Content-Security-Policy that nginx.conf SERVES on the shell
// document. `ng serve` and Karma send no CSP at all, so neither the unit suite
// nor an e2e run against the dev server can see this header; it is checked
// here, against the file the Dockerfile copies into the image as
// /etc/nginx/conf.d/default.conf.
//
//   node --test scripts/check-nginx-csp.test.mjs   (npm run check:nginx-csp)
//
// Why the shell must carry login-ui's agent origin: a federated remote mounted
// into the shell runs under the SHELL's policy, never its own. login-ui admits
// the loopback sign-in agent in its own nginx CSP (hugmesh-login-ui#31, PR
// #37), which only helps when login-ui is loaded standalone. Mounted at /login,
// the probe is governed by this header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The fixed loopback origin of the local passwordless sign-in agent (Studio).
// Source of truth: AGENT_ORIGIN in hugmesh-login-ui
// src/app/local-agent.service.ts. That file is in another repo, so the value
// is pinned here rather than read; if login-ui ever moves the agent, this test
// and nginx.conf move with it.
const AGENT_ORIGIN = 'http://127.0.0.1:27621';

/** Every `add_header Content-Security-Policy "..."` in the conf, comment lines excluded. */
function servedPolicies(conf) {
  const code = conf
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  return [...code.matchAll(/add_header\s+Content-Security-Policy\s+"([^"]*)"/g)].map((m) => m[1]);
}

/** Source list of one directive, or null when the policy does not set it. */
function directive(policy, name) {
  const d = policy
    .split(';')
    .map((s) => s.trim().split(/\s+/))
    .find((t) => t[0] === name);
  return d ? d.slice(1) : null;
}

const conf = fs.readFileSync(path.join(ROOT, 'nginx.conf'), 'utf8');
const policies = servedPolicies(conf);

test('nginx.conf serves at least one Content-Security-Policy header', () => {
  assert.ok(policies.length >= 1, 'no add_header Content-Security-Policy outside comments');
});

test('every served policy admits the loopback sign-in agent origin in connect-src', () => {
  for (const p of policies) {
    const cs = directive(p, 'connect-src');
    assert.ok(cs, `no connect-src in: ${p}`);
    assert.ok(cs.includes(AGENT_ORIGIN), `connect-src lacks ${AGENT_ORIGIN}: ${cs.join(' ')}`);
  }
});

test('connect-src admits that one origin and nothing wider', () => {
  for (const p of policies) {
    const cs = directive(p, 'connect-src');
    assert.ok(!cs.includes('http:'), 'bare http: scheme source admits every plaintext origin');
    assert.ok(!cs.some((t) => t.includes('*')), `wildcard source in connect-src: ${cs.join(' ')}`);
    const plaintext = cs.filter((t) => /^http:\/\//i.test(t));
    assert.deepEqual(plaintext, [AGENT_ORIGIN], 'connect-src may carry exactly one plaintext origin');
    assert.ok(!cs.includes('ws:'), 'bare ws: scheme source admits every plaintext socket');
  }
});

test('the pre-existing connect-src sources are still there', () => {
  for (const p of policies) {
    const cs = directive(p, 'connect-src');
    for (const t of ["'self'", 'blob:', 'https:', 'wss:']) assert.ok(cs.includes(t), `connect-src lost ${t}`);
  }
});

test('script-src was not loosened and does not carry the agent origin', () => {
  for (const p of policies) {
    const ss = directive(p, 'script-src');
    assert.ok(ss, `no script-src in: ${p}`);
    assert.ok(ss.includes("'nonce-$cspnonce'"), 'script-src lost the per-response nonce');
    // Exact tokens: 'wasm-unsafe-eval' is deliberate (see nginx.conf) and must
    // not be mistaken for 'unsafe-eval'.
    for (const t of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", 'http:', '*', AGENT_ORIGIN]) {
      assert.ok(!ss.includes(t), `script-src carries ${t}`);
    }
  }
});

test('the parser ignores a CSP that appears only in a comment', () => {
  const onlyComment = `server {\n  # add_header Content-Security-Policy "connect-src ${AGENT_ORIGIN}" always;\n}\n`;
  assert.deepEqual(servedPolicies(onlyComment), []);
});
