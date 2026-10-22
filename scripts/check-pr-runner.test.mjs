// RED tests for scripts/check-pr-runner.mjs.
//
//   node --test scripts/check-pr-runner.test.mjs
//
// Every case runs the REAL script as a child process against workflow files in
// a fresh temp directory. The first case runs it against this repo's own
// .github/workflows, so reverting the coverage.yml runs-on fix turns it red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(HERE, 'check-pr-runner.mjs');

function runDir(dir) {
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-runner-'));
  try {
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return runDir(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const job = (runsOn) => `jobs:\n  build:\n    runs-on: ${runsOn}\n    steps:\n      - run: echo hi\n`;
const PR_ON = 'on:\n  push:\n    branches: ["main"]\n  pull_request:\n    branches: ["main"]\n\n';
const PUSH_ON = 'on:\n  push:\n    branches: [main]\n\n';
const OLD_LINE = `\${{ fromJSON(vars.RUNS_ON || '"ubuntu-latest"') }}`;
const GATED_LINE = `\${{ fromJSON(github.event_name == 'push' && vars.RUNS_ON || '"ubuntu-latest"') }}`;

test("this repo's own workflows pass", () => {
  const r = runDir(path.join(ROOT, '.github', 'workflows'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PASS/);
});

test('the PR #107 line fails on a pull_request workflow', () => {
  const r = run({ 'coverage.yml': PR_ON + job(OLD_LINE) });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /coverage\.yml:\d+: runs-on .* can reach a self-hosted runner/);
});

test('the push-only gate passes on a pull_request workflow', () => {
  const r = run({ 'coverage.yml': PR_ON + job(GATED_LINE) });
  assert.equal(r.code, 0, r.out);
});

test('a hosted label passes', () => {
  assert.equal(run({ 'a.yml': PR_ON + job('ubuntu-latest') }).code, 0);
  assert.equal(run({ 'a.yml': PR_ON + job('"ubuntu-24.04"') }).code, 0);
});

test('a literal self-hosted label fails, in every spelling', () => {
  assert.equal(run({ 'a.yml': PR_ON + job('self-hosted') }).code, 1);
  assert.equal(run({ 'a.yml': PR_ON + job('[self-hosted, Linux, X64]') }).code, 1);
  assert.equal(run({ 'a.yml': PR_ON + 'jobs:\n  b:\n    runs-on:\n      - self-hosted\n      - Linux\n' }).code, 1);
  assert.equal(run({ 'a.yml': PR_ON + 'jobs:\n  b:\n    runs-on:\n      group: Default\n' }).code, 1);
});

test('a gate that a pull request can satisfy fails', () => {
  // != 'pull_request' still lets pull_request_target and others through, and
  // any other expression is not the accepted shape.
  const r = run({ 'a.yml': PR_ON + job(`\${{ fromJSON(github.event_name != 'pull_request' && vars.RUNS_ON || '"ubuntu-latest"') }}`) });
  assert.equal(r.code, 1, r.out);
  assert.equal(run({ 'a.yml': PR_ON + job('${{ matrix.os }}') }).code, 1);
});

test('inline and pull_request_target triggers are detected', () => {
  assert.equal(run({ 'a.yml': 'on: [push, pull_request]\n' + job(OLD_LINE) }).code, 1);
  assert.equal(run({ 'a.yml': 'on: pull_request_target\n' + job('self-hosted') }).code, 1);
  assert.equal(run({ 'a.yml': 'on:\n  pull_request_target:\n    types: [opened]\n' + job('self-hosted') }).code, 1);
});

test('a push-only workflow may use the self-hosted runner', () => {
  assert.equal(run({ 'release.yml': PUSH_ON + job(OLD_LINE) }).code, 0);
  assert.equal(run({ 'release.yml': PUSH_ON + job('self-hosted') }).code, 0);
});

test('a comment that mentions pull_request does not make a push workflow PR-triggered', () => {
  const text = '# no pull_request trigger here\non:\n  push:\n    branches: [main]\n  # pull_request: disabled\n' + job('self-hosted');
  assert.equal(run({ 'a.yml': text }).code, 0);
});

test('one bad file among good ones fails the run and is named', () => {
  const r = run({ 'good.yml': PR_ON + job('ubuntu-latest'), 'bad.yaml': PR_ON + job(OLD_LINE) });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /bad\.yaml/);
  assert.doesNotMatch(r.out, /good\.yml:/);
});

test('an empty or missing directory is an error, not a pass', () => {
  assert.equal(run({}).code, 2);
  assert.equal(runDir(path.join(os.tmpdir(), 'pr-runner-does-not-exist-x')).code, 2);
});
