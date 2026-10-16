#!/usr/bin/env node
/**
 * check-runtime-audit.mjs
 *
 * Fails when `npm audit` reports a moderate-or-worse advisory against the
 * RUNTIME dependency tree (`--omit=dev`), i.e. what `npm start` (server.js)
 * loads. Issue #72: the committed tree carried advisories nothing surfaced,
 * and the runtime ones (express' proxy-addr and qs, express-rate-limit's
 * ip-address) were the only ones on a path a deployed process executes.
 *
 * SCOPE. Runtime tree only. The e2e/dev toolchain (appium, nightwatch,
 * karma, gh-pages ...) has its own advisories that are NOT gated here: some
 * of their fixes are semver-major downgrades or bumps (issue #72 table), so
 * that is a decision for the operator, not something a gate may decide.
 *
 * NETWORK. With no argument it runs `npm audit --package-lock-only --omit=dev
 * --json`, which asks the registry. If that cannot be done (offline, bad
 * output) it exits 2: an audit that could not run is not a clean audit.
 *
 *   node scripts/check-runtime-audit.mjs                 live audit
 *   node scripts/check-runtime-audit.mjs --report f.json audit JSON from a file
 * Its tests:  node --test scripts/check-runtime-audit.test.mjs
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const THRESHOLD = 'moderate';

function readReport() {
  const i = process.argv.indexOf('--report');
  if (i !== -1) {
    const file = process.argv[i + 1];
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`ERROR: cannot read report ${file}: ${err.message}`);
      process.exit(2);
    }
  }
  const r = spawnSync(
    'npm',
    ['audit', '--package-lock-only', '--omit=dev', '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.error) {
    console.error(`ERROR: could not run npm audit: ${r.error.message}`);
    process.exit(2);
  }
  // npm audit exits 1 when it FINDS advisories, so the exit code says nothing
  // about whether it ran; the JSON body does.
  return r.stdout;
}

let report;
try {
  report = JSON.parse(readReport());
} catch (err) {
  console.error(`ERROR: npm audit did not produce JSON (offline?): ${err.message}`);
  process.exit(2);
}
if (report.error || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
  const why = report.error ? `${report.error.code}: ${report.error.summary}` : 'no "vulnerabilities" map';
  console.error(`ERROR: npm audit did not complete: ${why}`);
  process.exit(2);
}

const bad = Object.entries(report.vulnerabilities).filter(
  ([, v]) => (RANK[v.severity] ?? RANK.critical) >= RANK[THRESHOLD],
);
if (bad.length === 0) {
  console.log(`OK: no ${THRESHOLD}-or-worse advisory in the runtime dependency tree.`);
  process.exit(0);
}
console.error(`FAIL: ${bad.length} runtime package(s) with a ${THRESHOLD}-or-worse advisory:`);
for (const [name, v] of bad) {
  const via = (v.via ?? []).map((x) => (typeof x === 'string' ? x : x.title ?? x.url)).join('; ');
  console.error(`  ${v.severity.padEnd(8)} ${name} ${v.range ?? ''}  ${via}`);
}
console.error('Fix with `npm update <package> --package-lock-only` (or an override floor), then commit package-lock.json.');
process.exit(1);
