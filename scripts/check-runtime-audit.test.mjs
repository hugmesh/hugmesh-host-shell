// Tests for scripts/check-runtime-audit.mjs (issue #72).
//
//   node --test scripts/check-runtime-audit.test.mjs
//
// The script is run as a child process against an audit report written to a
// temp file, so no network is needed. The last case runs it against this
// repo's committed lockfile through the real `npm audit`; it is skipped when
// the registry is unreachable, because the script itself exits 2 there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(HERE, 'check-runtime-audit.mjs');

function runWithReport(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-'));
  try {
    const f = path.join(dir, 'report.json');
    if (text !== undefined) fs.writeFileSync(f, text);
    return spawnSync('node', [SCRIPT, '--report', f], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const report = (vulns) => JSON.stringify({ auditReportVersion: 2, vulnerabilities: vulns });
const vuln = (severity, name) => ({
  [name]: { name, severity, range: '<9.9.9', via: [{ title: `${name} advisory`, url: 'https://example.invalid' }] },
});

test('an empty report passes', () => {
  assert.equal(runWithReport(report({})).status, 0);
});

test('a low advisory does not fail the gate', () => {
  assert.equal(runWithReport(report(vuln('low', 'tiny'))).status, 0);
});

for (const sev of ['moderate', 'high', 'critical']) {
  test(`a ${sev} advisory fails the gate and names the package`, () => {
    const r = runWithReport(report(vuln(sev, 'proxy-addr')));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /proxy-addr/);
  });
}

test('an unknown severity is treated as the worst, not ignored', () => {
  assert.equal(runWithReport(report(vuln('catastrophic', 'x'))).status, 1);
});

test('a report that is not JSON exits 2, not 0', () => {
  assert.equal(runWithReport('npm ERR! getaddrinfo ENOTFOUND registry.npmjs.org').status, 2);
});

test('an npm error body exits 2, not 0', () => {
  const r = runWithReport(JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'offline' } }));
  assert.equal(r.status, 2);
});

test('a missing report file exits 2', () => {
  assert.equal(runWithReport(undefined).status, 2);
});

test('the committed lockfile has no moderate-or-worse runtime advisory', (t) => {
  const r = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 2) return t.skip(`registry unreachable: ${r.stderr.trim()}`);
  assert.equal(r.status, 0, r.stderr);
});
