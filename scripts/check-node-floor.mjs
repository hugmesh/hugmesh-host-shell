#!/usr/bin/env node
/**
 * check-node-floor.mjs
 *
 * The node running the build must satisfy the `engines.node` range that
 * package-lock.json records for each package in REQUIRED below (issue #92).
 *
 * WHY. `npm ci` only WARNS on an engines mismatch (.npmrc has no
 * engine-strict), and the Dockerfile build stage had a floor check for npm but
 * none for node. @softarc/native-federation-orchestrator 4.6.1 raised its
 * engines.node from >=22.14.0 to >=24.16.0, while @angular/core still accepts
 * ^24.15.0, so an image on node 24.15.x installs with a warning and can then
 * fail inside the orchestrator with an error that names neither node nor the
 * range. This turns that into a build failure that names both.
 *
 * DERIVED, NOT HARDCODED. No node version is written here or in the
 * Dockerfile. The ranges are read from package-lock.json, so the floor moves
 * with the next dependency bump without an edit. That is the point: a
 * hardcoded floor goes stale downward (the Dockerfile's 4.3.2 override
 * history). What IS written here is the list of package NAMES, and a name the
 * lockfile no longer holds FAILS the check rather than dropping out of it, so
 * the list cannot go stale silently either.
 *
 * Every copy is checked: an entry matches when the path after its LAST
 * `node_modules/` is exactly the name, so a nested copy counts and a lookalike
 * (`@softarc/native-federation-orchestrator` for `@softarc/native-federation`)
 * does not. An entry with no engines.node is reported and imposes nothing.
 *
 * FAIL-CLOSED. The range reader below is deliberately small: comparators
 * >=, >, <=, <, =, ^ and ~ over full or partial numeric versions (`>= 12`,
 * `^24.15.0`), joined by spaces (AND) and `||` (OR). Anything else (`*`, `x`,
 * hyphen ranges, prerelease tags in a range, an empty range) FAILS the build
 * with the package and the range it could not read, instead of passing it. A
 * node version that does not parse as vX.Y.Z fails the same way. A prerelease
 * or build suffix on the RUNNING node (v24.16.0-nightly...) is compared as its
 * X.Y.Z, so it passes >=24.16.0 -- deliberate, the same choice the npm floor
 * check in the Dockerfile makes for 11.3.0-pre.
 *
 * Lockfile only, node built-ins only: it runs before `npm ci`, with no
 * node_modules at all (so not the `semver` package, which the lock holds but
 * which is not on disk yet). Reads ./package-lock.json from the current
 * directory and checks process.version.
 *   node scripts/check-node-floor.mjs            # what the Dockerfile runs
 *   node scripts/check-node-floor.mjs v24.15.0   # check another version (tests)
 * Its RED tests: node --test scripts/check-node-floor.test.mjs
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Packages whose engines.node the build's node must satisfy. */
export const REQUIRED = [
  // The runtime federation loader; it carries the highest floor today.
  '@softarc/native-federation-orchestrator',
  '@softarc/native-federation',
  '@angular-architects/native-federation',
  '@angular/core',
  // What `npm run build` (ng build) actually executes in the build stage.
  '@angular/build',
  '@angular/cli',
];

const LOCKFILE = 'package-lock.json';

/** Parse `v24.16.0` / `24.16.0` (suffix ignored) into [major, minor, patch]. */
export function parseNodeVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.+-]*)?$/.exec(String(v).trim());
  if (!m) throw new Error(`cannot parse node version "${v}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

const TEST = {
  '>=': (c) => c >= 0,
  '>': (c) => c > 0,
  '<=': (c) => c <= 0,
  '<': (c) => c < 0,
};

/**
 * Desugar one comparator token into primitive [op, [M,m,p]] pairs with op in
 * >=, >, <=, <. Throws on anything outside the supported grammar.
 */
function desugar(token, range) {
  const m = /^(>=|<=|>|<|=|\^|~)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(token);
  if (!m) throw new Error(`unsupported comparator "${token}" in range "${range}"`);
  const op = m[1] ?? '=';
  const parts = [m[2], m[3], m[4]].filter((x) => x !== undefined).map(Number);
  const n = parts.length;
  const [M, mi = 0, p = 0] = parts;
  const low = [M, mi, p];
  // Smallest version NOT matched by the partial `M` / `M.m` (exclusive upper).
  const nextPartial = n === 1 ? [M + 1, 0, 0] : [M, mi + 1, 0];
  switch (op) {
    case '>=':
      return [['>=', low]];
    case '>':
      return n === 3 ? [['>', low]] : [['>=', nextPartial]];
    case '<':
      return [['<', low]];
    case '<=':
      return n === 3 ? [['<=', low]] : [['<', nextPartial]];
    case '=':
      return n === 3 ? [['>=', low], ['<=', low]] : [['>=', low], ['<', nextPartial]];
    case '~':
      return [['>=', low], ['<', n === 1 ? [M + 1, 0, 0] : [M, mi + 1, 0]]];
    case '^': {
      let high;
      if (M > 0 || n === 1) high = [M + 1, 0, 0];
      else if (mi > 0 || n === 2) high = [0, mi + 1, 0];
      else high = [0, 0, p + 1];
      return [['>=', low], ['<', high]];
    }
  }
  throw new Error(`unsupported comparator "${token}" in range "${range}"`);
}

/** Parse a range into OR-ed sets of AND-ed primitive comparators. */
export function parseRange(range) {
  if (typeof range !== 'string' || range.trim() === '') {
    throw new Error(`unsupported range ${JSON.stringify(range)}`);
  }
  return range.split('||').map((set) => {
    const tokens = set.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/);
    if (tokens.length === 1 && tokens[0] === '') {
      throw new Error(`empty alternative in range "${range}"`);
    }
    return tokens.flatMap((t) => desugar(t, range));
  });
}

/** True when version (an [M,m,p]) satisfies range. Throws on an unreadable range. */
export function satisfies(version, range) {
  return parseRange(range).some((set) => set.every(([op, b]) => TEST[op](cmp(version, b))));
}

/** Every lockfile path that holds a copy of `name`. */
export function copiesOf(lock, name) {
  return Object.keys(lock.packages ?? {}).filter(
    (p) => p === `node_modules/${name}` || p.endsWith(`/node_modules/${name}`),
  );
}

/**
 * Check `nodeVersion` against every REQUIRED package's engines.node in `lock`.
 * Returns { ok: [...lines], fail: [...lines] }.
 */
export function check(lock, nodeVersion, required = REQUIRED) {
  const ok = [];
  const fail = [];
  let version;
  try {
    version = parseNodeVersion(nodeVersion);
  } catch (err) {
    return { ok, fail: [`${err.message}; the node floor cannot be checked`] };
  }
  for (const name of required) {
    const paths = copiesOf(lock, name);
    if (paths.length === 0) {
      fail.push(
        `${LOCKFILE} holds no copy of ${name}; it is listed in scripts/check-node-floor.mjs ` +
          'REQUIRED -- if the dependency was removed on purpose, remove it from that list too',
      );
      continue;
    }
    for (const p of paths) {
      const entry = lock.packages[p];
      const at = `${name}@${entry?.version ?? '?'} (${p})`;
      const range = entry?.engines?.node;
      if (range === undefined) {
        ok.push(`${at}: no engines.node, nothing to enforce`);
        continue;
      }
      let good;
      try {
        good = satisfies(version, range);
      } catch (err) {
        fail.push(`${at}: engines.node "${range}" is not readable by this check (${err.message})`);
        continue;
      }
      if (good) ok.push(`${at}: node ${nodeVersion} satisfies engines.node "${range}"`);
      else fail.push(`${at} requires node "${range}" (engines.node in ${LOCKFILE}); this is node ${nodeVersion}`);
    }
  }
  return { ok, fail };
}

function main() {
  const nodeVersion = process.argv[2] ?? process.version;
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf8'));
  } catch (err) {
    console.error(`FATAL: cannot read ${LOCKFILE} in ${process.cwd()}: ${err.message}`);
    process.exit(1);
  }
  const { ok, fail } = check(lock, nodeVersion);
  for (const line of ok) console.log(`node floor: ${line}`);
  if (fail.length) {
    for (const line of fail) console.error(`FATAL: ${line}`);
    console.error(
      'FATAL: node floor not met -- the build base image has moved below a range the ' +
        'lockfile requires; pick an image whose node satisfies every range above',
    );
    process.exit(1);
  }
  console.log(`node ${nodeVersion} satisfies the engines.node floor of every package checked`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
