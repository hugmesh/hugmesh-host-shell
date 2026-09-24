// RED tests for scripts/check-nf-single-copy.mjs (issue #73, decision 94).
//
//   node --test scripts/check-nf-single-copy.test.mjs
//
// Plain node:test, not a karma spec: karma runs in a browser and cannot spawn a
// process or write a temp lockfile. Built-ins only, so it runs before `npm ci`.
//
// Every case runs the REAL script as a child process against a lockfile in a
// fresh temp directory, built from this repo's committed package-lock.json, so
// the fixtures track the real tree instead of a hand-written toy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(HERE, 'check-nf-single-copy.mjs');
const HOISTED = 'node_modules/@softarc/native-federation';
const NESTED = `node_modules/@softarc/native-federation-node/${HOISTED}`;

const realLock = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

function run(lockfileText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-single-copy-'));
  try {
    if (lockfileText !== undefined) fs.writeFileSync(path.join(dir, 'package-lock.json'), lockfileText);
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the committed lockfile holds exactly one copy -> exit 0', () => {
  const lock = realLock();
  assert.ok(lock.packages[HOISTED], `precondition: ${HOISTED} is in the committed lockfile`);
  const r = run(JSON.stringify(lock));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /OK: .*exactly one copy/);
});

test('a second, nested copy -> exit 1, naming BOTH paths', () => {
  const lock = realLock();
  // The exact shape #73 reproduced by re-adding the dead native-federation-node.
  lock.packages[NESTED] = { version: '4.1.3' };
  const r = run(JSON.stringify(lock));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /records 2 copies/);
  assert.ok(r.out.includes(`${HOISTED}  `), r.out);
  assert.ok(r.out.includes(`${NESTED}  4.1.3`), r.out);
});

test('a lookalike package (native-federation-orchestrator) is NOT counted', () => {
  const lock = realLock();
  // The real lockfile already holds the hoisted orchestrator; add a nested one
  // too. Both end in "native-federation-orchestrator", not "native-federation".
  assert.ok(lock.packages[`${HOISTED}-orchestrator`], 'precondition: orchestrator is in the lockfile');
  lock.packages[`node_modules/x/${HOISTED}-orchestrator`] = { version: '9.9.9' };
  const r = run(JSON.stringify(lock));
  assert.equal(r.status, 0, r.out);
});

test('zero copies -> exit 1', () => {
  const lock = realLock();
  delete lock.packages[HOISTED];
  const r = run(JSON.stringify(lock));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /records NO copy/);
});

test('a lockfile with no "packages" map (lockfileVersion 1) fails closed', () => {
  const r = run(JSON.stringify({ lockfileVersion: 1, dependencies: {} }));
  assert.equal(r.status, 1, r.out);
});

test('a missing or unparseable lockfile fails closed', () => {
  assert.equal(run(undefined).status, 1);
  assert.equal(run('{not json').status, 1);
});

test('coverage.yml runs this exact script, before npm ci', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/coverage.yml'), 'utf8');
  // Only live YAML counts: a commented-out step must not satisfy this.
  const live = yml.split('\n').filter((l) => !/^\s*#/.test(l));
  const gate = live.findIndex((l) => /^\s*run:\s*node scripts\/check-nf-single-copy\.mjs\s*$/.test(l));
  const ci = live.findIndex((l) => /^\s*npm ci\s*$/.test(l));
  assert.ok(gate >= 0, 'no live `run: node scripts/check-nf-single-copy.mjs` step in coverage.yml');
  assert.ok(ci >= 0, 'no live `npm ci` line in coverage.yml');
  assert.ok(gate < ci, 'the single-copy gate must run before npm ci');
  // The step that owns that line must not be made optional.
  let start = gate;
  while (start > 0 && !/^\s*- /.test(live[start])) start -= 1;
  let end = gate + 1;
  while (end < live.length && !/^\s*- /.test(live[end])) end += 1;
  const step = live.slice(start, end).join('\n');
  assert.doesNotMatch(step, /^\s*(- )?(if|continue-on-error):/m, `the gate step is conditional or non-fatal:\n${step}`);
});
