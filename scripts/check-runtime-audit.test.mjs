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
const report = (vulns) =>
  JSON.stringify({ auditReportVersion: 2, vulnerabilities: vulns, metadata: { dependencies: { total: 197 } } });
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

test('a report that counts no dependencies exits 2, not 0', () => {
  assert.equal(runWithReport(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} })).status, 2);
  const zero = { auditReportVersion: 2, vulnerabilities: {}, metadata: { dependencies: { total: 0 } } };
  assert.equal(runWithReport(JSON.stringify(zero)).status, 2);
});

// ---------------------------------------------------------------------------
// Offline mode (round-2 finding on #77). npm in offline mode does not ask the
// registry and prints a well-formed report with no vulnerabilities, which the
// gate used to read as a clean tree and exit 0 on.
//
// FIXTURE: a project whose runtime tree pins proxy-addr 2.0.7, the critical
// advisory main's lockfile carried.
function vulnerableProject(extraNpmrc = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-proj-'));
  const deps = { 'proxy-addr': '2.0.7' };
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'p', version: '0.0.0', private: true, dependencies: deps }),
  );
  fs.writeFileSync(
    path.join(dir, 'package-lock.json'),
    JSON.stringify({
      name: 'p',
      version: '0.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: 'p', version: '0.0.0', dependencies: deps },
        'node_modules/proxy-addr': {
          version: '2.0.7',
          resolved: 'https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.7.tgz',
        },
      },
    }),
  );
  fs.writeFileSync(path.join(dir, '.npmrc'), `legacy-peer-deps=true\n${extraNpmrc}`);
  return dir;
}

// A stand-in `npm` first on PATH, so these cases need no network. It resolves
// `offline` the way npm does (command line, then env, then project .npmrc,
// then the userconfig file) and, when offline, prints the empty report real
// npm prints. Online it reports proxy-addr@2.0.7 and minimist@1.2.5 when the
// lockfile in its cwd pins them. MODE=empty makes it answer `{}` whatever the
// flags say, like a mirror without the advisory endpoint.
const FAKE_NPM = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const rc = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const flag = args.find((a) => a.startsWith('--offline='));
let offline;
if (flag) offline = flag === '--offline=true';
else if (process.env.npm_config_offline) offline = process.env.npm_config_offline === 'true';
else offline = /^offline\\s*=\\s*true/m.test(rc('.npmrc')) ||
  /^offline\\s*=\\s*true/m.test(rc(process.env.npm_config_userconfig || '/nonexistent'));
const lock = JSON.parse(rc('package-lock.json') || '{}');
const vulnerabilities = {};
const known = { 'proxy-addr': '2.0.7', minimist: '1.2.5' };
if (!offline && process.env.FAKE_NPM_MODE !== 'empty') {
  for (const [n, v] of Object.entries(known)) {
    if (lock.packages?.['node_modules/' + n]?.version === v) {
      vulnerabilities[n] = { name: n, severity: 'critical', range: '<=' + v, via: [{ title: n + ' advisory' }] };
    }
  }
}
const total = Object.keys(lock.packages || {}).length;
process.stdout.write(JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: { dependencies: { total } } }));
process.exit(Object.keys(vulnerabilities).length ? 1 : 0);
`;

function withFakeNpm(fn) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-bin-'));
  try {
    fs.writeFileSync(path.join(bin, 'npm'), FAKE_NPM, { mode: 0o755 });
    return fn(`${bin}${path.delimiter}${process.env.PATH}`);
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

function runIn(dir, env) {
  return spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
}

const OFFLINE_SPELLINGS = [
  ['npm_config_offline=true', () => ({ env: { npm_config_offline: 'true' } })],
  ['offline=true in the project .npmrc', () => ({ npmrc: 'offline=true\n' })],
  [
    'offline=true in the userconfig file',
    (tmp) => {
      const f = path.join(tmp, 'user.npmrc');
      fs.writeFileSync(f, 'offline=true\n');
      return { env: { npm_config_userconfig: f } };
    },
  ],
  ['offline=true in env AND both .npmrc files', (tmp) => {
    const f = path.join(tmp, 'user.npmrc');
    fs.writeFileSync(f, 'offline=true\n');
    return { env: { npm_config_offline: 'true', npm_config_userconfig: f }, npmrc: 'offline=true\n' };
  }],
];

for (const [label, make] of OFFLINE_SPELLINGS) {
  test(`offline mode (${label}) cannot pass a vulnerable runtime lock [stand-in npm]`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-uc-'));
    const { env = {}, npmrc = '' } = make(tmp);
    const dir = vulnerableProject(npmrc);
    try {
      const r = withFakeNpm((PATH) => runIn(dir, { ...env, PATH }));
      assert.equal(r.status, 1, `expected FAIL (1), got ${r.status}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /proxy-addr/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test(`offline mode (${label}) cannot pass a vulnerable runtime lock [real npm]`, (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-uc-'));
    const { env = {}, npmrc = '' } = make(tmp);
    const dir = vulnerableProject(npmrc);
    try {
      const r = runIn(dir, env);
      // 1 = the advisory was found; 2 = the audit could not run (no
      // registry here). Both refuse the lock; only 0 is the bypass.
      assert.notEqual(r.status, 0, `the vulnerable lock passed: ${r.stdout}${r.stderr}`);
      if (r.status === 2) return t.skip(`audit could not run: ${r.stderr.trim().split('\n')[0]}`);
      assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /proxy-addr/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

test('a registry that answers an empty report for everything exits 2, not 0 (canary)', () => {
  const dir = vulnerableProject();
  try {
    const r = withFakeNpm((PATH) => runIn(dir, { PATH, FAKE_NPM_MODE: 'empty' }));
    assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /canary/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed lockfile has no moderate-or-worse runtime advisory', (t) => {
  const r = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 2) return t.skip(`registry unreachable: ${r.stderr.trim()}`);
  assert.equal(r.status, 0, r.stderr);
});
