// Offline tests for the runtime dependency floors (issue #72).
//
//   node --test scripts/runtime-lock-floors.test.mjs
//
// scripts/check-runtime-audit.mjs asks the registry, so it cannot run offline
// (it exits 2, and its lockfile test is skipped). These tests read only the
// committed package-lock.json, so a regression to a vulnerable runtime copy
// goes red with no network.
//
// "Runtime" means a lockfile entry reached from package.json's dependencies
// by Node's resolution (scripts/runtime-lock.mjs), i.e. what `npm start`
// (server.js) can load. It is NOT read from the lockfile's own `dev` flags:
// nothing checks those, and a lock that flagged a vulnerable runtime copy dev
// hid it from this test and from npm audit --omit=dev alike (round 3).
//
// Floors. proxy-addr 2.0.8 is the patched release the advisory names
// (GHSA-jqcg-44mw-7w3h: an IPv4-mapped IPv6 trust subnet makes every client a
// trusted proxy, so req.ip is whatever the client puts in X-Forwarded-For).
// qs 6.16.1 and fast-uri 3.1.8 are the versions the lockfile resolved when
// `npm audit --omit=dev` reported 0 (the audit's ranges end at 6.15.3 and
// 3.1.7). ip-address 10.7.1 and browserslist 4.28.7 are INFERRED from the
// audit's "<=10.7.0" and "<=4.28.6" ranges, not named by an advisory; the
// lockfile resolves 10.7.4 and 4.29.x. The live audit stays the authority; these
// floors only make a regression visible offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { followsPeers, lockProblems, registryTarball, runtimeKeys } from './runtime-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export const FLOORS = {
  'proxy-addr': '2.0.8',
  qs: '6.16.1',
  'fast-uri': '3.1.8',
  'ip-address': '10.7.1',
  browserslist: '4.28.7',
};

function cmp(a, b) {
  const pa = a.split('-')[0].split('.').map(Number);
  const pb = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  // A prerelease sorts below its release, so 2.0.8-rc.1 does not meet 2.0.8.
  return (a.includes('-') ? 0 : 1) - (b.includes('-') ? 0 : 1);
}

/**
 * Every runtime copy of `name` in a lockfile: [{ at, version }]. Runtime is
 * what the walk from `pkgJson` (default: the lock's own root entry) reaches,
 * whatever the entries' `dev` flags say.
 */
export function runtimeCopies(lock, name, pkgJson = lock.packages?.[''] ?? {}, opts = {}) {
  const keys = runtimeKeys(pkgJson, lock, opts);
  const out = [];
  for (const [at, entry] of Object.entries(lock.packages ?? {})) {
    if (at === `node_modules/${name}` || at.endsWith(`/node_modules/${name}`)) {
      if (keys.has(at)) out.push({ at, version: entry.version });
    }
  }
  return out;
}

/** The floors a lockfile violates, as readable strings. */
export function floorViolations(lock, floors = FLOORS, pkgJson = lock.packages?.[''] ?? {}, opts = {}) {
  const bad = [];
  for (const [name, floor] of Object.entries(floors)) {
    for (const c of runtimeCopies(lock, name, pkgJson, opts)) {
      if (typeof c.version !== 'string' || cmp(c.version, floor) < 0) {
        bad.push(`${c.at} is ${c.version}, floor is ${floor}`);
      }
    }
  }
  return bad;
}

const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const peers = followsPeers(ROOT);

test('the committed lockfile holds every runtime package at or above its patched floor', () => {
  assert.deepEqual(floorViolations(lock, FLOORS, pkgJson, { peers }), []);
});

test('each floored package is actually present on the runtime path (the test is not vacuous)', () => {
  for (const name of Object.keys(FLOORS)) {
    assert.ok(runtimeCopies(lock, name, pkgJson, { peers }).length > 0, `${name} has no runtime copy in the lockfile`);
  }
});

test('the committed lockfile is honest about its runtime tree (flags, versions, tarballs)', () => {
  assert.deepEqual(lockProblems(pkgJson, lock, { peers }), []);
});

test('the walked runtime tree is exactly the set npm flagged non-dev (the walk models npm)', () => {
  const walked = [...runtimeKeys(pkgJson, lock, { peers })].sort();
  const nonDev = Object.keys(lock.packages).filter((k) => k && !lock.packages[k].dev).sort();
  assert.ok(walked.length > 50, `only ${walked.length} runtime entries walked`);
  assert.deepEqual(walked, nonDev);
});

// ---------------------------------------------------------------------------
// Round 3: a lock that lies about itself. Built from the committed lock, the
// way the skeptic built it: the hoisted proxy-addr becomes 2.0.7 (critical
// GHSA-jqcg-44mw-7w3h) flagged `dev: true`, and a decoy non-dev 2.0.8 is
// parked under karma so "a runtime copy exists and meets the floor" holds.
// npm accepts that lock (`npm ls` shows express -> proxy-addr@2.0.7, `npm ci`
// installs it) and both gates used to pass it.
const PROXY_ADDR_207 = {
  version: '2.0.7',
  resolved: 'https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.7.tgz',
  integrity: 'sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==',
  license: 'MIT',
  dependencies: { forwarded: '0.2.0', 'ipaddr.js': '1.9.1' },
  engines: { node: '>= 0.10' },
};
function skepticLock() {
  const l = structuredClone(lock);
  const good = l.packages['node_modules/proxy-addr'];
  l.packages['node_modules/proxy-addr'] = { ...PROXY_ADDR_207, dev: true };
  l.packages['node_modules/karma/node_modules/proxy-addr'] = { ...good };
  return l;
}

test('EXPLOIT: a dev-flagged vulnerable runtime copy plus a non-dev decoy fails the floor check', () => {
  const v = floorViolations(skepticLock(), FLOORS, pkgJson, { peers });
  assert.deepEqual(v, ['node_modules/proxy-addr is 2.0.7, floor is 2.0.8']);
});

test('EXPLOIT: the same lock fails the lockfile honesty check, naming the runtime path', () => {
  const p = lockProblems(pkgJson, skepticLock(), { peers });
  assert.equal(p.length, 1, p.join('\n'));
  assert.match(p[0], /^node_modules\/proxy-addr \(express > proxy-addr\) .*"dev": true/);
});

test('a dev flag on an UNFLOORED runtime package fails too (no floor needed)', () => {
  const l = structuredClone(lock);
  l.packages['node_modules/forwarded'] = { ...l.packages['node_modules/forwarded'], dev: true };
  const p = lockProblems(pkgJson, l, { peers });
  assert.equal(p.length, 1, p.join('\n'));
  assert.match(p[0], /node_modules\/forwarded \(express > proxy-addr > forwarded\)/);
});

// ---------------------------------------------------------------------------
// The checker itself, against synthetic lockfiles. A package's lock entry
// holds its `dependencies`; the root entry ('') holds the project's.
const PKG = (name, version, deps, extra = {}) => ({
  version,
  resolved: registryTarball(name, version),
  integrity: 'sha512-AAAA',
  ...(deps ? { dependencies: deps } : {}),
  ...extra,
});
const fake = (rootDeps, entries) => ({
  packages: { '': { name: 'p', version: '0.0.0', dependencies: rootDeps }, ...Object.fromEntries(entries) },
});
const pj = (deps, extra = {}) => ({ name: 'p', version: '0.0.0', dependencies: deps, ...extra });

test('the checker flags the vulnerable proxy-addr that main shipped', () => {
  const l = fake({ 'proxy-addr': '2.0.7' }, [['node_modules/proxy-addr', PKG('proxy-addr', '2.0.7')]]);
  assert.deepEqual(floorViolations(l), ['node_modules/proxy-addr is 2.0.7, floor is 2.0.8']);
});

test('the checker flags a NESTED vulnerable copy even when the hoisted copy is fine', () => {
  const l = fake({ express: '5', qs: '6' }, [
    ['node_modules/express', PKG('express', '5.2.1', { qs: '6' })],
    ['node_modules/qs', PKG('qs', '6.16.1')],
    ['node_modules/express/node_modules/qs', PKG('qs', '6.15.3')],
  ]);
  assert.deepEqual(floorViolations(l), ['node_modules/express/node_modules/qs is 6.15.3, floor is 6.16.1']);
});

test('the checker ignores copies the runtime tree does not reach, even when flagged non-dev', () => {
  const l = fake({}, [['node_modules/qs', PKG('qs', '6.15.3')]]);
  assert.deepEqual(floorViolations(l), []);
});

test('the checker counts a copy the runtime tree reaches even when it is flagged dev', () => {
  const l = fake({ qs: '6' }, [['node_modules/qs', PKG('qs', '6.15.3', null, { dev: true })]]);
  assert.deepEqual(floorViolations(l), ['node_modules/qs is 6.15.3, floor is 6.16.1']);
});

test('a dev-flagged copy two levels down is found through the nested node_modules Node would load', () => {
  const l = fake({ a: '1' }, [
    ['node_modules/a', PKG('a', '1.0.0', { b: '1' })],
    ['node_modules/a/node_modules/b', PKG('b', '1.0.0', { 'proxy-addr': '2' })],
    ['node_modules/a/node_modules/b/node_modules/proxy-addr', PKG('proxy-addr', '2.0.7', null, { dev: true })],
    ['node_modules/proxy-addr', PKG('proxy-addr', '2.0.8')],
  ]);
  const p = lockProblems(pj({ a: '1' }), l, { peers: false });
  assert.equal(p.length, 1, p.join('\n'));
  assert.match(p[0], /^node_modules\/a\/node_modules\/b\/node_modules\/proxy-addr \(a > b > proxy-addr\)/);
  assert.equal(floorViolations(l).length, 1);
});

test('a dependency resolves to the nearest enclosing node_modules, not the hoisted copy', () => {
  // a -> b -> c; c sits beside b under a, so Node loads node_modules/a/node_modules/c.
  const l = fake({ a: '1' }, [
    ['node_modules/a', PKG('a', '1.0.0', { b: '1' })],
    ['node_modules/a/node_modules/b', PKG('b', '1.0.0', { c: '1' })],
    ['node_modules/a/node_modules/c', PKG('c', '1.0.0', null, { dev: true })],
    ['node_modules/c', PKG('c', '2.0.0', null, { dev: true })],
  ]);
  const p = lockProblems(pj({ a: '1' }), l, { peers: false });
  assert.deepEqual(p.map((x) => x.split(' ')[0]), ['node_modules/a/node_modules/c']);
});

test('a version the tarball is not (audit reads one, npm ci installs the other) fails', () => {
  const l = fake({ 'proxy-addr': '2' }, [
    ['node_modules/proxy-addr', { ...PROXY_ADDR_207, version: '2.0.8', dependencies: undefined }],
  ]);
  const p = lockProblems(pj({ 'proxy-addr': '2' }), l, { peers: false });
  assert.equal(p.length, 1, p.join('\n'));
  assert.match(p[0], /says proxy-addr@2\.0\.8 but resolves to .*proxy-addr-2\.0\.7\.tgz/);
});

for (const [label, patch] of [
  ['another package\'s tarball', { resolved: registryTarball('evil-addr', '2.0.8') }],
  ['a non-registry tarball', { resolved: 'https://example.invalid/proxy-addr/-/proxy-addr-2.0.8.tgz' }],
  ['a git dependency', { resolved: 'git+ssh://git@example.invalid/x/proxy-addr.git#abc' }],
  ['no resolved at all', { resolved: undefined }],
  ['a prerelease tarball for a release version', { resolved: registryTarball('proxy-addr', '2.0.8-rc.1') }],
]) {
  test(`a runtime entry whose resolved is ${label} fails`, () => {
    const l = fake({ 'proxy-addr': '2' }, [['node_modules/proxy-addr', { ...PKG('proxy-addr', '2.0.8'), ...patch }]]);
    assert.equal(lockProblems(pj({ 'proxy-addr': '2' }), l, { peers: false }).length, 1);
  });
}

test('a scoped runtime package checks against its scoped tarball URL', () => {
  const l = fake({ '@s/x': '1' }, [['node_modules/@s/x', PKG('@s/x', '1.2.3')]]);
  assert.equal(registryTarball('@s/x', '1.2.3'), 'https://registry.npmjs.org/@s/x/-/x-1.2.3.tgz');
  assert.deepEqual(lockProblems(pj({ '@s/x': '1' }), l, { peers: false }), []);
});

test('an aliased runtime package checks against the real package it installs', () => {
  const l = fake({ alias: 'npm:proxy-addr@2' }, [
    ['node_modules/alias', { ...PKG('proxy-addr', '2.0.8'), name: 'proxy-addr' }],
  ]);
  assert.deepEqual(lockProblems(pj({ alias: 'npm:proxy-addr@2' }), l, { peers: false }), []);
});

test('a runtime entry with no version, or no sha512 integrity, fails', () => {
  for (const patch of [{ version: undefined }, { integrity: undefined }, { integrity: 'sha1-AAAA' }]) {
    const l = fake({ x: '1' }, [['node_modules/x', { ...PKG('x', '1.0.0'), ...patch }]]);
    assert.equal(lockProblems(pj({ x: '1' }), l, { peers: false }).length, 1, JSON.stringify(patch));
  }
});

test('a runtime link fails closed (npm audit audits neither links nor their targets)', () => {
  const l = fake({ x: '1' }, [
    ['node_modules/x', { link: true, resolved: 'vendor/x' }],
    ['vendor/x', PKG('x', '1.0.0')],
  ]);
  const p = lockProblems(pj({ x: '1' }), l, { peers: false });
  assert.ok(p.some((x) => /is a link/.test(x)), p.join('\n'));
});

test('a required runtime dependency the lock does not hold fails closed; an optional one does not', () => {
  const l = fake({ a: '1' }, [['node_modules/a', PKG('a', '1.0.0', { gone: '1' }, { optionalDependencies: { maybe: '1' } })]]);
  const p = lockProblems(pj({ a: '1' }), l, { peers: false });
  assert.deepEqual(p, ['node_modules/a needs gone, which the lockfile does not hold']);
});

test('a runtime dependency moved to devDependencies in the lock root (package.json unchanged) fails', () => {
  const l = fake({}, [['node_modules/proxy-addr', PKG('proxy-addr', '2.0.7', null, { dev: true })]]);
  l.packages[''].devDependencies = { 'proxy-addr': '2' };
  const p = lockProblems(pj({ 'proxy-addr': '2' }), l, { peers: false });
  assert.ok(p.some((x) => /package\.json dependencies \[proxy-addr\] and the lockfile root entry \[\] disagree/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /"dev": true/.test(x)), p.join('\n'));
  assert.equal(floorViolations(l, FLOORS, pj({ 'proxy-addr': '2' })).length, 1);
});

test('a runtime dependency only the lock root names is still walked (either side counts)', () => {
  const l = fake({ 'proxy-addr': '2' }, [['node_modules/proxy-addr', PKG('proxy-addr', '2.0.7', null, { dev: true })]]);
  const p = lockProblems(pj({}), l, { peers: false });
  assert.ok(p.some((x) => /"dev": true/.test(x)), p.join('\n'));
});

test('peers are followed unless the project .npmrc sets legacy-peer-deps', () => {
  const l = fake({ a: '1' }, [
    ['node_modules/a', PKG('a', '1.0.0', null, { peerDependencies: { p: '1' } })],
    ['node_modules/p', PKG('p', '1.0.0', null, { dev: true })],
  ]);
  assert.equal(lockProblems(pj({ a: '1' }), l, { peers: true }).length, 1);
  assert.deepEqual(lockProblems(pj({ a: '1' }), l, { peers: false }), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-lock-npmrc-'));
  try {
    assert.equal(followsPeers(dir), true, 'no .npmrc: peers count');
    fs.writeFileSync(path.join(dir, '.npmrc'), 'legacy-peer-deps=false\n');
    assert.equal(followsPeers(dir), true);
    fs.writeFileSync(path.join(dir, '.npmrc'), 'registry=x\nlegacy-peer-deps=true\n');
    assert.equal(followsPeers(dir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the checker compares numerically, not as strings (4.28.10 is newer than 4.28.7)', () => {
  const l = fake({ browserslist: '4' }, [['node_modules/browserslist', PKG('browserslist', '4.28.10')]]);
  assert.deepEqual(floorViolations(l), []);
  const m = fake({ browserslist: '4' }, [['node_modules/browserslist', PKG('browserslist', '4.9.9')]]);
  assert.equal(floorViolations(m).length, 1);
});

test('a prerelease of the floor version does not meet the floor', () => {
  const l = fake({ 'proxy-addr': '2' }, [['node_modules/proxy-addr', PKG('proxy-addr', '2.0.8-rc.1')]]);
  assert.equal(floorViolations(l).length, 1);
});

test('an entry with no version fails closed', () => {
  const l = fake({ 'fast-uri': '3' }, [['node_modules/fast-uri', {}]]);
  assert.equal(floorViolations(l).length, 1);
});

// The exploit input itself, against whatever proxy-addr is installed. Skipped
// when node_modules is absent (the lockfile tests above still cover that case).
test('an untrusted peer cannot choose its own address through a short IPv4-mapped trust subnet', (t) => {
  let proxyaddr;
  try {
    proxyaddr = createRequire(path.join(ROOT, 'package.json'))('proxy-addr');
  } catch {
    return t.skip('proxy-addr is not installed (run npm ci)');
  }
  // 203.0.113.9 is not in 10.0.0.0/8. The operator "trusts" 10/8 but spells it
  // ::ffff:10.0.0.0/8 (the correct spelling is /104). proxy-addr 2.0.7 compiled
  // that to a subnet matching every IPv4 address, so the forged header won.
  const req = { connection: { remoteAddress: '203.0.113.9' }, headers: { 'x-forwarded-for': '1.2.3.4' } };
  for (const spelling of ['::ffff:10.0.0.0/8', '::/1', '::ffff:10.0.0.0/104', '10.0.0.0/8']) {
    assert.equal(proxyaddr(req, proxyaddr.compile(spelling)), '203.0.113.9', `trust ${spelling}`);
  }
});

test('a genuinely trusted proxy is still believed (the fix did not turn forwarding off)', (t) => {
  let proxyaddr;
  try {
    proxyaddr = createRequire(path.join(ROOT, 'package.json'))('proxy-addr');
  } catch {
    return t.skip('proxy-addr is not installed (run npm ci)');
  }
  const req = { connection: { remoteAddress: '10.1.2.3' }, headers: { 'x-forwarded-for': '198.51.100.7' } };
  assert.equal(proxyaddr(req, proxyaddr.compile('10.0.0.0/8')), '198.51.100.7');
  assert.equal(proxyaddr(req, proxyaddr.compile('::ffff:10.0.0.0/104')), '198.51.100.7');
});

// ---------------------------------------------------------------------------
// Dev-tree floors (issue #72, 2026-11-04). The floors above cover only what
// `npm start` can load. These cover EVERY copy in the lockfile, dev included,
// for the packages whose Dependabot alerts the overrides in package.json close.
// An override pin rots silently: shell-quote was pinned at 1.9.0, which sits
// inside GHSA-pqg4-j6r4-53mv (>=1.8.4 <1.11.0, critical), so the pin itself
// held the vulnerable copy in place. A floor is per major line where the
// advisory patched more than one line: a copy is held to the floor of its own
// major, or of the nearest major below it; a copy below every listed major
// fails. Floors are the first patched releases the advisories name:
//   shell-quote 1.11.0           GHSA-pqg4-j6r4-53mv (critical)
//   piscina 4.9.4 / 5.3.2        GHSA-67c8-pqhq-4rmx (critical; nightwatch's
//                                nested copy is on 4.x, Angular's on 5.x)
//   serialize-javascript 7.1.3   GHSA-m5mm-p8h7-m29v (low)
export const DEV_FLOORS = {
  'shell-quote': { 1: '1.11.0' },
  piscina: { 4: '4.9.4', 5: '5.3.2' },
  'serialize-javascript': { 7: '7.1.3' },
};

// Packages that must not be in the lockfile at all. nightwatch-html-reporter
// was an unused devDependency (every e2e script passes -r ./e2e/html-reporter.js,
// this repo's own handlebars reporter) and the only parent of nconf 0.8.5
// (GHSA-6xwr-q98w-rvg7), pug 2.0.4 (GHSA-p493-635q-r6gr, GHSA-3965-hpx2-q597)
// and xml2js 0.4.23 (GHSA-776f-qx25-q3cc). If one of them is ever needed
// again, take it out of this list deliberately, with a patched version.
export const DEV_ABSENT = ['nightwatch-html-reporter', 'nconf', 'pug', 'xml2js'];

/** Every copy of `name` anywhere in the lockfile, dev or not: [{ at, version }]. */
export function allCopies(lock, name) {
  const out = [];
  for (const [at, entry] of Object.entries(lock.packages ?? {})) {
    if (at === `node_modules/${name}` || at.endsWith(`/node_modules/${name}`)) out.push({ at, version: entry?.version });
  }
  return out;
}

function floorFor(byMajor, version) {
  const major = Number(String(version).split('.')[0]);
  const below = Object.keys(byMajor)
    .map(Number)
    .filter((m) => m <= major)
    .sort((a, b) => b - a);
  return below.length ? byMajor[below[0]] : null;
}

/** The dev floors and absences a lockfile violates, as readable strings. */
export function devFloorViolations(lock, floors = DEV_FLOORS, absent = DEV_ABSENT) {
  const bad = [];
  for (const [name, byMajor] of Object.entries(floors)) {
    for (const c of allCopies(lock, name)) {
      if (typeof c.version !== 'string' || !/^\d+\.\d+\.\d+/.test(c.version)) {
        bad.push(`${c.at} has no usable version (${c.version})`);
        continue;
      }
      const floor = floorFor(byMajor, c.version);
      if (floor === null) bad.push(`${c.at} is ${c.version}, below every patched line (${Object.values(byMajor).join(', ')})`);
      else if (cmp(c.version, floor) < 0) bad.push(`${c.at} is ${c.version}, floor is ${floor}`);
    }
  }
  for (const name of absent) {
    for (const c of allCopies(lock, name)) bad.push(`${c.at} (${c.version}) must not be in the lockfile`);
  }
  return bad;
}

test('DEV: every lockfile copy of a dev-floored package is at or above its patched floor, and the removed reporter chain is gone', () => {
  assert.deepEqual(devFloorViolations(lock), []);
});

test('DEV: each dev-floored package is present, and piscina has a 4.x copy under nightwatch (the floors are not vacuous)', () => {
  for (const name of Object.keys(DEV_FLOORS)) {
    assert.ok(allCopies(lock, name).length > 0, `${name} has no copy in the lockfile`);
  }
  const nested = lock.packages['node_modules/nightwatch/node_modules/piscina'];
  assert.ok(nested && /^4\./.test(nested.version), 'nightwatch no longer nests a 4.x piscina: revisit the overrides.nightwatch.piscina pin');
});

test('DEV: package.json no longer asks for nightwatch-html-reporter', () => {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    assert.ok(!Object.hasOwn(pkgJson[field] ?? {}, 'nightwatch-html-reporter'), field);
  }
});

test('DEV checker: the pre-fix pins fail (shell-quote 1.9.0, nested piscina 4.9.3, serialize-javascript 7.0.7)', () => {
  const l = fake({}, [
    ['node_modules/shell-quote', PKG('shell-quote', '1.9.0')],
    ['node_modules/nightwatch/node_modules/piscina', PKG('piscina', '4.9.3')],
    ['node_modules/piscina', PKG('piscina', '5.3.2')],
    ['node_modules/serialize-javascript', PKG('serialize-javascript', '7.0.7')],
  ]);
  assert.deepEqual(devFloorViolations(l), [
    'node_modules/shell-quote is 1.9.0, floor is 1.11.0',
    'node_modules/nightwatch/node_modules/piscina is 4.9.3, floor is 4.9.4',
    'node_modules/serialize-javascript is 7.0.7, floor is 7.1.3',
  ]);
});

test('DEV checker: piscina is held to the floor of its own major line', () => {
  const at = (v) => fake({}, [['node_modules/piscina', PKG('piscina', v)]]);
  assert.deepEqual(devFloorViolations(at('4.9.4')), []);
  assert.deepEqual(devFloorViolations(at('5.3.2')), []);
  assert.deepEqual(devFloorViolations(at('6.0.0')), []);
  assert.deepEqual(devFloorViolations(at('5.3.1')), ['node_modules/piscina is 5.3.1, floor is 5.3.2']);
  assert.equal(devFloorViolations(at('3.2.0')).length, 1);
  assert.equal(devFloorViolations(at('5.3.2-rc.1')).length, 1);
});

test('DEV checker: any copy of a removed package fails, nested or hoisted', () => {
  const l = fake({}, [
    ['node_modules/nightwatch-html-reporter', PKG('nightwatch-html-reporter', '2.0.6')],
    ['node_modules/a/node_modules/nconf', PKG('nconf', '0.13.0')],
  ]);
  assert.deepEqual(devFloorViolations(l), [
    'node_modules/nightwatch-html-reporter (2.0.6) must not be in the lockfile',
    'node_modules/a/node_modules/nconf (0.13.0) must not be in the lockfile',
  ]);
});

test('DEV checker: a floored entry with no version fails closed', () => {
  const l = fake({}, [['node_modules/shell-quote', {}]]);
  assert.equal(devFloorViolations(l).length, 1);
});
