// RED tests for scripts/check-node-floor.mjs (issue #92).
//
//   node --test scripts/check-node-floor.test.mjs
//
// Plain node:test, built-ins only, so it runs before `npm ci` (same reason as
// check-nf-single-copy.test.mjs). Every case runs the REAL script as a child
// process -- the exact command the Dockerfile build stage runs, plus the node
// version as argv -- against a lockfile in a fresh temp directory built from
// this repo's committed package-lock.json, with engines.node rewritten where a
// case needs a specific range. So the fixtures track the real tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(HERE, 'check-node-floor.mjs');
const ORCH = 'node_modules/@softarc/native-federation-orchestrator';
const CORE = 'node_modules/@angular/core';
const ANGULAR = '^22.22.3 || ^24.15.0 || >=26.0.0';

const realLock = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

/** Committed lock with every REQUIRED entry's engines.node set from `ranges`. */
function lockWith(ranges) {
  const lock = realLock();
  for (const [p, range] of Object.entries(ranges)) {
    assert.ok(lock.packages[p], `precondition: ${p} is in the committed lockfile`);
    if (range === undefined) delete lock.packages[p].engines;
    else lock.packages[p].engines = { ...(lock.packages[p].engines ?? {}), node: range };
  }
  return lock;
}

/** Only the orchestrator range under test; every other checked entry accepts anything. */
function onlyOrchestrator(range) {
  const lock = realLock();
  for (const [p, e] of Object.entries(lock.packages)) {
    if (e?.engines?.node !== undefined && p !== ORCH) e.engines.node = '>=0.0.0';
  }
  lock.packages[ORCH].engines = { node: range };
  return lock;
}

/** Only the @angular/core range under test. */
function onlyCore(range) {
  const lock = realLock();
  for (const [p, e] of Object.entries(lock.packages)) {
    if (e?.engines?.node !== undefined && p !== CORE) e.engines.node = '>=0.0.0';
  }
  lock.packages[CORE].engines = { node: range };
  return lock;
}

function run(lock, ...args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-floor-'));
  try {
    if (lock !== undefined) {
      fs.writeFileSync(path.join(dir, 'package-lock.json'), typeof lock === 'string' ? lock : JSON.stringify(lock));
    }
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The red/green table, one range at a time. RED = exit 1, GREEN = exit 0.
const TABLE = [
  // >=24.16.0 -- the orchestrator 4.6.1+ floor from the issue.
  [onlyOrchestrator, '>=24.16.0', 'v24.15.0', 1],
  [onlyOrchestrator, '>=24.16.0', 'v24.15.9', 1],
  [onlyOrchestrator, '>=24.16.0', 'v22.22.3', 1],
  [onlyOrchestrator, '>=24.16.0', 'v24.16.0', 0],
  [onlyOrchestrator, '>=24.16.0', 'v24.16.1', 0],
  [onlyOrchestrator, '>=24.16.0', 'v24.22.0', 0],
  [onlyOrchestrator, '>=24.16.0', 'v26.0.0', 0],
  // A prerelease of the bound is compared as X.Y.Z (documented, deliberate).
  [onlyOrchestrator, '>=24.16.0', 'v24.16.0-nightly20261101abc', 0],
  // ^22.22.3 || ^24.15.0 || >=26.0.0 -- Angular 22's range.
  [onlyCore, ANGULAR, 'v20.19.0', 1],
  [onlyCore, ANGULAR, 'v22.22.2', 1],
  [onlyCore, ANGULAR, 'v22.22.3', 0],
  [onlyCore, ANGULAR, 'v22.99.0', 0],
  [onlyCore, ANGULAR, 'v23.0.0', 1],
  [onlyCore, ANGULAR, 'v24.14.9', 1],
  [onlyCore, ANGULAR, 'v24.15.0', 0],
  [onlyCore, ANGULAR, 'v24.16.0', 0],
  [onlyCore, ANGULAR, 'v25.9.9', 1],
  [onlyCore, ANGULAR, 'v26.0.0', 0],
  [onlyCore, ANGULAR, 'v27.1.0', 0],
];

for (const [build, range, version, want] of TABLE) {
  test(`"${range}" with node ${version} -> exit ${want}`, () => {
    const r = run(build(range), version);
    assert.equal(r.status, want, r.out);
    if (want === 1) {
      assert.ok(r.out.includes(`requires node "${range}"`), `names the range:\n${r.out}`);
      assert.ok(r.out.includes(`this is node ${version}`), `names the version:\n${r.out}`);
    }
  });
}

test('both ranges at once: 24.15.0 is RED and the failure names the orchestrator, not @angular/core', () => {
  const r = run(lockWith({ [ORCH]: '>=24.16.0', [CORE]: ANGULAR }), 'v24.15.0');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FATAL: @softarc\/native-federation-orchestrator@\S+ \(node_modules\/@softarc\/native-federation-orchestrator\) requires node ">=24\.16\.0"/);
  assert.doesNotMatch(r.out, /FATAL: @angular\/core/);
  assert.match(r.out, /@angular\/core@\S+ .*satisfies engines\.node/);
});

test('both ranges at once: 22.22.3 satisfies Angular but not the orchestrator -> RED', () => {
  const r = run(lockWith({ [ORCH]: '>=24.16.0', [CORE]: ANGULAR }), 'v22.22.3');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FATAL: @softarc\/native-federation-orchestrator/);
});

test('both ranges at once: 24.16.0 and 26.1.0 -> GREEN', () => {
  for (const v of ['v24.16.0', 'v26.1.0']) {
    const r = run(lockWith({ [ORCH]: '>=24.16.0', [CORE]: ANGULAR }), v);
    assert.equal(r.status, 0, `${v}\n${r.out}`);
    assert.match(r.out, /satisfies the engines\.node floor of every package checked/);
  }
});

test('DERIVED: raising the orchestrator range in the lock raises the floor with no script edit', () => {
  const r = run(lockWith({ [ORCH]: '>=26.0.0' }), 'v24.22.0');
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes('requires node ">=26.0.0"'), r.out);
});

test('a NESTED copy is checked too (exact name after the last node_modules/)', () => {
  const lock = onlyOrchestrator('>=0.0.0');
  const nested = `node_modules/@angular-architects/native-federation/${ORCH}`;
  lock.packages[nested] = { version: '9.9.9', engines: { node: '>=30.0.0' } };
  const r = run(lock, 'v26.0.0');
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes(`(${nested}) requires node ">=30.0.0"`), r.out);
});

test('a lookalike name is NOT counted as the package', () => {
  // A hoisted "@angular/core-lookalike" must not stand in for @angular/core.
  const lock = realLock();
  lock.packages['node_modules/@angular/core-lookalike'] = { version: '1.0.0', engines: { node: '>=99.0.0' } };
  const r = run(lock, 'v24.22.0');
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /lookalike/);
});

test('a REQUIRED package missing from the lockfile -> RED, naming it (the list cannot go stale silently)', () => {
  const lock = realLock();
  for (const p of Object.keys(lock.packages)) {
    if (p === ORCH || p.endsWith(`/${ORCH}`)) delete lock.packages[p];
  }
  const r = run(lock, 'v26.0.0');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /holds no copy of @softarc\/native-federation-orchestrator/);
});

test('a REQUIRED package with no engines.node -> reported, imposes nothing', () => {
  const r = run(lockWith({ [ORCH]: undefined }), 'v24.15.0');
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /native-federation-orchestrator@\S+ .*no engines\.node, nothing to enforce/);
});

for (const range of ['~24.16.0', '^24.16.0', '>= 24.16', '>24.15', '<=26 >=24.16.0']) {
  test(`supported spelling "${range}": 24.15.9 RED, 24.16.0 GREEN`, () => {
    assert.equal(run(onlyOrchestrator(range), 'v24.15.9').status, 1);
    assert.equal(run(onlyOrchestrator(range), 'v24.16.0').status, 0);
  });
}

for (const range of ['*', '24.x', '>=24.16.x', '24.16.0 - 26', '>=v24.16.0', '>=24.16.0-0', '', ' || >=24']) {
  test(`FAIL-CLOSED: unreadable range ${JSON.stringify(range)} -> RED even on a new node`, () => {
    const r = run(onlyOrchestrator(range), 'v99.0.0');
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /is not readable by this check/);
  });
}

for (const v of ['unknown', '24', 'v24.x.0', '']) {
  test(`FAIL-CLOSED: unparseable node version ${JSON.stringify(v)} -> RED`, () => {
    const r = run(realLock(), v);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /cannot parse node version/);
  });
}

test('no lockfile -> RED', () => {
  const r = run(undefined, 'v26.0.0');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cannot read package-lock\.json/);
});

test('the committed lockfile, the running node, no argument (what the Dockerfile runs)', () => {
  const r = run(realLock());
  // CI pins node 24.x (>= 24.16 today); a red here means the job's own node is
  // below what the lockfile requires, which is the defect this check reports.
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes(`node ${process.version} satisfies the engines.node floor`), r.out);
  assert.match(r.out, /native-federation-orchestrator@\S+ .*satisfies engines\.node/);
  assert.match(r.out, /@angular\/core@\S+ .*satisfies engines\.node/);
});
