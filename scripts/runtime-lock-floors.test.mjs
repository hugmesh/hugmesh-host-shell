// Offline tests for the runtime dependency floors (issue #72).
//
//   node --test scripts/runtime-lock-floors.test.mjs
//
// scripts/check-runtime-audit.mjs asks the registry, so it cannot run offline
// (it exits 2, and its lockfile test is skipped). These tests read only the
// committed package-lock.json, so a regression to a vulnerable runtime copy
// goes red with no network.
//
// "Runtime" means a lockfile entry that is not flagged `dev: true`, i.e. what
// `npm ci --omit=dev` installs and `npm start` (server.js) can load.
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
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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

/** Every runtime copy of `name` in a lockfile: [{ at, version }]. */
export function runtimeCopies(lock, name) {
  const out = [];
  for (const [at, entry] of Object.entries(lock.packages ?? {})) {
    if (at === `node_modules/${name}` || at.endsWith(`/node_modules/${name}`)) {
      if (!entry.dev) out.push({ at, version: entry.version });
    }
  }
  return out;
}

/** The floors a lockfile violates, as readable strings. */
export function floorViolations(lock, floors = FLOORS) {
  const bad = [];
  for (const [name, floor] of Object.entries(floors)) {
    for (const c of runtimeCopies(lock, name)) {
      if (typeof c.version !== 'string' || cmp(c.version, floor) < 0) {
        bad.push(`${c.at} is ${c.version}, floor is ${floor}`);
      }
    }
  }
  return bad;
}

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

test('the committed lockfile holds every runtime package at or above its patched floor', () => {
  assert.deepEqual(floorViolations(lock), []);
});

test('each floored package is actually present on the runtime path (the test is not vacuous)', () => {
  for (const name of Object.keys(FLOORS)) {
    assert.ok(runtimeCopies(lock, name).length > 0, `${name} has no runtime copy in the lockfile`);
  }
});

// The checker itself, against synthetic lockfiles.
const fake = (entries) => ({ packages: Object.fromEntries(entries) });

test('the checker flags the vulnerable proxy-addr that main shipped', () => {
  const l = fake([['node_modules/proxy-addr', { version: '2.0.7' }]]);
  assert.deepEqual(floorViolations(l), ['node_modules/proxy-addr is 2.0.7, floor is 2.0.8']);
});

test('the checker flags a NESTED vulnerable copy even when the hoisted copy is fine', () => {
  const l = fake([
    ['node_modules/qs', { version: '6.16.1' }],
    ['node_modules/express/node_modules/qs', { version: '6.15.3' }],
  ]);
  assert.deepEqual(floorViolations(l), ['node_modules/express/node_modules/qs is 6.15.3, floor is 6.16.1']);
});

test('the checker ignores dev-only copies (those are not the runtime path)', () => {
  const l = fake([['node_modules/qs', { version: '6.15.3', dev: true }]]);
  assert.deepEqual(floorViolations(l), []);
});

test('the checker compares numerically, not as strings (4.28.10 is newer than 4.28.7)', () => {
  const l = fake([['node_modules/browserslist', { version: '4.28.10' }]]);
  assert.deepEqual(floorViolations(l), []);
  const m = fake([['node_modules/browserslist', { version: '4.9.9' }]]);
  assert.equal(floorViolations(m).length, 1);
});

test('a prerelease of the floor version does not meet the floor', () => {
  const l = fake([['node_modules/proxy-addr', { version: '2.0.8-rc.1' }]]);
  assert.equal(floorViolations(l).length, 1);
});

test('an entry with no version fails closed', () => {
  const l = fake([['node_modules/fast-uri', {}]]);
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
