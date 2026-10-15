#!/usr/bin/env node
/**
 * check-nf-single-copy.mjs
 *
 * The lockfile must record EXACTLY ONE copy of @softarc/native-federation.
 *
 * This is HARD 3 of the deleted scripts/check-nf-override.mjs (removed by #53,
 * `git show 5a2d773^:scripts/check-nf-override.mjs`), restored on its own by
 * decision 94 = A on issue #73 (answered 2026-09-23). The counting logic below
 * is that block UNCHANGED; only the messages were rewritten, because the old
 * ones pointed at an override that no longer exists.
 *
 * WHY. The apparatus this came from existed because a version of this package
 * that the rest of the tree did not expect reached production. Measured on
 * 2026-09-16 (issue #73): with a second copy injected, `npm ci`, `npm test` and
 * `npm run build` all still pass, so nothing else in this repo notices one.
 * Today a second copy does no measured harm (the old "two copies compile to
 * TS2724" rationale does not reproduce on Angular 22 / TS 6), so this is an
 * early warning at the bump that introduces the copy, not a proven outage.
 *
 * WHAT IT DOES NOT DO. It does not look at node_modules or at any version: a
 * stale SINGLE copy passes here, and `npm run build` is what catches that one
 * (issue #73, 2026-09-24 comment). It deliberately does NOT use `npm ls`, which
 * exits 0 on a stale override and already exits 1 on main from ~188 unrelated
 * ELSPROBLEMS lines, so its exit code can neither pass nor fail this honestly.
 *
 * Lockfile only, node built-ins only: it runs before `npm ci`, with no
 * node_modules at all. Reads ./package-lock.json from the current directory.
 * Run locally with:  node scripts/check-nf-single-copy.mjs
 * Its RED tests:     node --test scripts/check-nf-single-copy.test.mjs
 */
import fs from 'node:fs';

const PKG = '@softarc/native-federation';
const CONSUMER = '@angular-architects/native-federation';
const HOISTED_PATH = `node_modules/${PKG}`;
const LOCKFILE = 'package-lock.json';

let lock;
try {
  lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf8'));
} catch (err) {
  console.error(`FAIL: cannot read ${LOCKFILE} in ${process.cwd()}: ${err.message}`);
  process.exit(1);
}

// --- HARD 3 (unchanged): the lockfile must record EXACTLY ONE copy. ---
const copies = Object.keys(lock.packages ?? {}).filter((p) =>
  p === HOISTED_PATH || p.endsWith(`/${HOISTED_PATH}`),
);
if (copies.length === 1) {
  console.log(`OK: ${LOCKFILE} records exactly one copy of ${PKG} (${copies[0]}).`);
  process.exit(0);
}
if (copies.length === 0) {
  const required = lock.packages?.[`node_modules/${CONSUMER}`]?.dependencies?.[PKG];
  console.error(
    `FAIL: ${LOCKFILE} records NO copy of ${PKG}` +
      (required ? `, but ${CONSUMER} requires "${required}".` : '.') +
      (lock.packages ? '' : ` It has no "packages" map at all (lockfileVersion ${lock.lockfileVersion}).`),
  );
  process.exit(1);
}
console.error(`FAIL: ${LOCKFILE} records ${copies.length} copies of ${PKG}:`);
for (const p of copies) console.error(`        ${p}  ${lock.packages[p]?.version}`);
console.error(
  `      Exactly one is expected: ${CONSUMER} resolves it and nothing else should. ` +
    `Find what pulls in the extra copy (\`npm explain ${PKG}\`), then remove or bump ` +
    'that dependency, re-run `npm install` and commit package-lock.json.',
);
process.exit(1);
