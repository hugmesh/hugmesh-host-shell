#!/usr/bin/env node
/**
 * Override contract gate for overrides["@softarc/native-federation"].
 *
 * WHY THIS EXISTS -- and why the production build is NOT a substitute.
 *
 * `overrides` bypasses npm's resolver, so a pin that contradicts what
 * @angular-architects/native-federation actually requires installs with exit 0
 * and no ERESOLVE. It was measured on this repo that such a pin ALSO survives
 * `ng build --configuration production`, both on the committed lockfile and on
 * a full fresh re-resolve, as long as the drift is small:
 *
 *   override 4.4.1 under @angular-architects 22.1.2 (requires ~4.5.0)
 *       npm install -> exit 0, ONE hoisted copy at 4.4.1, zero nested
 *       ng build --configuration production -> exit 0, bundle emitted
 *   override 4.3.2 under @angular-architects 22.1.x
 *       ng build -> exit 1, "@softarc/native-federation/internal does not
 *       provide an export named 'isUnderAnyDir'", no bundle
 *
 * So the build only fires once the pin is stale enough to break the /internal
 * export surface -- i.e. one or more bumps AFTER the drift was introduced, in a
 * commit that looks unrelated to the cause. This gate fires at the bump that
 * introduces the drift, which is the only place it is cheap to fix.
 *
 * Dependabot cannot maintain this pin: it only rewrites an override whose value
 * literally matches the old dependency range, and a bare pin like "4.4.1" never
 * matches "^4.4.0". That is why the link is invisible to it and why this gate,
 * rather than a bot, is what keeps the pin honest.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const PKG = '@softarc/native-federation';
const CONSUMER = '@angular-architects/native-federation';

/**
 * Consumers whose declared range the override is knowingly forced past.
 *
 * @softarc/native-federation-node@4.0.0 pins EXACTLY "4.1.3" and drags in
 * @softarc/native-federation-runtime@4.1.2 ("^4.1.0"). Both are forced to the
 * override, tree-wide, with no ERESOLVE. That is tolerated ONLY because
 * native-federation-node is imported nowhere in this repo (it appears in
 * package.json and in README prose and nowhere else) and npm marks it
 * end-of-life in favour of @softarc/native-federation-orchestrator, which is
 * already in the tree via @angular-architects. Removing that dead dependency
 * would make this whole override -- and this gate -- unnecessary.
 *
 * NOTE the limit of this exemption: the gate reads package manifests, so it
 * cannot see an `import` appearing in src/. If native-federation-node ever
 * starts being used, delete it from this list and reckon with the pin.
 */
const TOLERATED_FORCED_PAST = new Set([
  '@softarc/native-federation-node',
  '@softarc/native-federation-runtime',
]);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

let semver;
try {
  semver = createRequire(import.meta.url)('semver');
} catch {
  // Fail loudly rather than skipping. A gate that silently opts out when a
  // transitive hoist moves is worse than no gate at all.
  console.error(
    "FAIL: cannot resolve 'semver'. It is normally hoisted top-level by the " +
      'Angular toolchain. Run this gate after `npm install`, or add semver as a ' +
      'devDependency -- do NOT delete this step.',
  );
  process.exit(1);
}

const pkg = readJson('package.json');
const override = pkg.overrides?.[PKG];

// The authoritative constraint: what @angular-architects actually asks for.
// Prefer the installed manifest; fall back to the lockfile so the gate still
// says something useful before an install.
let required;
let requiredFrom;
try {
  required = readJson(`node_modules/${CONSUMER}/package.json`).dependencies?.[PKG];
  requiredFrom = `node_modules/${CONSUMER}/package.json`;
} catch {
  const lock = readJson('package-lock.json');
  required = lock.packages?.[`node_modules/${CONSUMER}`]?.dependencies?.[PKG];
  requiredFrom = 'package-lock.json';
}

if (!required) {
  console.error(
    `FAIL: could not read the ${PKG} range required by ${CONSUMER}. ` +
      'Run this gate after `npm install`.',
  );
  process.exit(1);
}

let failed = false;

// --- HARD 1: the override must permit ONLY versions the consumer accepts. ---
if (override === undefined) {
  console.log(
    `OK: no overrides["${PKG}"] is declared -- nothing to keep in sync. ` +
      `${CONSUMER} requires ${required} (per ${requiredFrom}).`,
  );
} else if (!semver.subset(override, required)) {
  console.error(
    `FAIL: overrides["${PKG}"] = "${override}" is not a subset of "${required}", ` +
      `which ${CONSUMER} requires (per ${requiredFrom}).`,
  );
  console.error(
    '      npm applies overrides WITHOUT resolution, so this installs and, if the ' +
      'drift is small, builds -- green and wrong. Raise the override in package.json ' +
      'and re-run `npm install` to regenerate the lockfile.',
  );
  failed = true;
} else {
  console.log(`OK: overrides["${PKG}"] = "${override}" satisfies "${required}" (${CONSUMER}).`);
}

// --- HARD 2: the tree on disk must agree with the override. ---
// Catches the other half: override raised but the lockfile never regenerated,
// which npm install against a committed lockfile will happily reproduce.
let installed;
try {
  installed = readJson(`node_modules/${PKG}/package.json`).version;
} catch {
  installed = undefined;
}
if (installed === undefined) {
  console.log(`SKIP: ${PKG} is not installed; run this gate after \`npm install\`.`);
} else if (!semver.satisfies(installed, required)) {
  console.error(
    `FAIL: the hoisted ${PKG} on disk is ${installed}, which does not satisfy ` +
      `"${required}". The lockfile is stale relative to package.json -- re-run ` +
      '`npm install` and commit package-lock.json.',
  );
  failed = true;
} else {
  console.log(`OK: hoisted ${PKG} on disk is ${installed}, satisfying "${required}".`);
}

// --- REPORT: every OTHER declared consumer of the overridden package. ---
// The override is tree-wide, so it has more than one victim. Print them so the
// second constraint cannot be forgotten by anyone reading only _overridesNote.
try {
  const lock = readJson('package-lock.json');
  const forced = override ?? installed;
  const others = [];
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    const range = meta?.dependencies?.[PKG] ?? meta?.peerDependencies?.[PKG];
    if (!range) continue;
    const name = meta.name ?? path.split('node_modules/').pop();
    if (name === CONSUMER || path === '') continue;
    const ok = forced ? semver.subset(forced, range) : true;
    others.push({ name, range, ok });
  }
  if (others.length) {
    console.log(`\nOther declared consumers of ${PKG} (the override applies to these too):`);
    for (const o of others) {
      console.log(`  ${o.ok ? 'ok         ' : 'FORCED PAST'} ${o.name} requires "${o.range}"`);
      if (!o.ok && !TOLERATED_FORCED_PAST.has(o.name)) {
        console.error(
          `FAIL: ${o.name} requires "${o.range}" and is forced to "${forced}" by the ` +
            'override. It is not in TOLERATED_FORCED_PAST in this script. Either drop ' +
            'the override, drop that dependency, or justify it in the list.',
        );
        failed = true;
      }
    }
  }
} catch (err) {
  // Informational half only -- never turn a lockfile parse hiccup into a red CI.
  console.log(`(could not enumerate other consumers: ${err.message})`);
}

process.exit(failed ? 1 : 0);
