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
 * OFFLINE MODE. npm in offline mode (`npm_config_offline=true`, or
 * `offline=true` in a project, user or global .npmrc) does not ask the
 * registry at all and prints a well-formed report with NO vulnerabilities,
 * which reads exactly like a clean tree. Two defences, because the report
 * body alone cannot tell the two apart:
 *   1. npm is spawned with the settings that decide this given on the
 *      command line (NPM_FLAGS below). npm ranks command-line flags above
 *      environment variables and .npmrc files, so that ambient config does
 *      not turn them off.
 *   2. A positive control. Before the real audit, the same command with the
 *      same environment and the same project .npmrc audits a throwaway
 *      lockfile that pins packages with published advisories (CANARY). If
 *      that comes back without a moderate-or-worse finding, the audit is not
 *      really running (offline by a setting not listed here, a registry
 *      or mirror that answers empty), and the script exits 2.
 *
 *   node scripts/check-runtime-audit.mjs                 live audit
 *   node scripts/check-runtime-audit.mjs --report f.json audit JSON from a file
 * Its tests:  node --test scripts/check-runtime-audit.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const THRESHOLD = 'moderate';

// Command-line flags outrank npm_config_* and .npmrc. Each one closes a
// setting that would let the audit skip the registry or audit nothing.
const NPM_FLAGS = [
  'audit',
  '--package-lock-only',
  '--omit=dev',
  '--json',
  '--offline=false',
  '--prefer-offline=false',
  '--audit=true',
  '--dry-run=false',
  '--registry=https://registry.npmjs.org/',
];

// Positive control: versions with published advisories.
// proxy-addr 2.0.7: GHSA-jqcg-44mw-7w3h (critical, the #72 runtime finding).
// minimist 1.2.5: CVE-2021-44906 (critical prototype pollution).
const CANARY = { 'proxy-addr': '2.0.7', minimist: '1.2.5' };

function runNpm(cwd) {
  const r = spawnSync('npm', NPM_FLAGS, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) {
    console.error(`ERROR: could not run npm audit: ${r.error.message}`);
    process.exit(2);
  }
  // npm audit exits 1 when it FINDS advisories, so the exit code says nothing
  // about whether it ran; the JSON body does.
  return r.stdout;
}

function canaryAudit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-canary-'));
  try {
    const pkg = { name: 'runtime-audit-canary', version: '0.0.0', private: true, dependencies: CANARY };
    const lock = {
      name: pkg.name,
      version: pkg.version,
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: pkg.name, version: pkg.version, dependencies: CANARY } },
    };
    for (const [name, version] of Object.entries(CANARY)) {
      lock.packages[`node_modules/${name}`] = {
        version,
        resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      };
    }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lock));
    // The project's own .npmrc applies to the real audit, so it applies here.
    const npmrc = path.join(process.cwd(), '.npmrc');
    if (fs.existsSync(npmrc)) fs.copyFileSync(npmrc, path.join(dir, '.npmrc'));
    let rep;
    try {
      rep = JSON.parse(runNpm(dir));
    } catch (err) {
      console.error(`ERROR: npm audit of the canary lockfile did not produce JSON (offline?): ${err.message}`);
      process.exit(2);
    }
    const hits = Object.keys(CANARY).filter((n) => {
      const v = rep?.vulnerabilities?.[n];
      return v && (RANK[v.severity] ?? RANK.critical) >= RANK[THRESHOLD];
    });
    if (hits.length === 0) {
      console.error(
        'ERROR: npm audit reported nothing for a canary lockfile with known advisories ' +
          `(${Object.entries(CANARY).map(([n, v]) => `${n}@${v}`).join(', ')}); ` +
          'the audit is not reaching the advisory database (offline mode, or a registry that answers empty).',
      );
      process.exit(2);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

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
  canaryAudit();
  return runNpm(process.cwd());
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
// Structural check: the lockfile was actually read. (This does NOT detect
// offline mode, whose report still counts the lockfile's dependencies.)
const deps = report.metadata?.dependencies?.total;
if (typeof deps !== 'number' || deps <= 0) {
  console.error('ERROR: npm audit report counts no dependencies (metadata.dependencies.total); the lockfile was not audited.');
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
