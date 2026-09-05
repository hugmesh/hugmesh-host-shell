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
 *
 * WHAT IT CHECKS -- three hard constraints, none of which may opt out silently.
 *
 *   HARD 1  the override permits ONLY versions the consumer accepts
 *   HARD 2  the version actually resolved agrees with BOTH that consumer range
 *           AND the override itself
 *   HARD 3  the lockfile records EXACTLY ONE copy of the package -- collapsing
 *           the copies is the only reason this override exists at all
 *
 * FAIL-OPEN PATHS CLOSED 2026-09-05 (measured; each was exit 0 before):
 *   - HARD 2 compared the disk against the CONSUMER RANGE and never against the
 *     override, so `override "4.5.0"` with a hoisted 4.5.9 printed
 *     `OK: ... satisfying "~4.5.0"` and exited 0 -- under a section header that
 *     claims "the tree on disk must agree with the override".
 *   - a missing hoisted copy printed `SKIP: ... is not installed` and exited 0,
 *     the exact silent opt-out this file's own semver branch below refuses to
 *     make. It now FAILS, naming the version the lockfile says should have been
 *     there. (It does NOT become a pre-install mode: the gate resolves semver
 *     from node_modules, so it cannot run before an install at all.)
 *   - an object-form override -- `{".": "4.4.1"}`, the shape used five times
 *     elsewhere in this same package.json -- threw
 *     `TypeError: range.trim is not a function` out of semver with a raw stack
 *     trace and no FAIL line. It failed safe (exit 1) but told the reader
 *     nothing. Both npm override shapes are now parsed explicitly.
 *
 * HARD 3 is what closes the last known gap: deleting the override key. Measured
 * on this repo, both ways that can reach CI:
 *   - key deleted, lockfile NOT regenerated -> `npm ci` itself exits 1 with
 *     EUSAGE, "Missing: @softarc/native-federation@4.1.3 from lock file".
 *   - key deleted AND `npm install --package-lock-only` run -> exit 0, and the
 *     lockfile grows a SECOND copy,
 *     node_modules/@softarc/native-federation-node/node_modules/@softarc/native-federation@4.1.3
 *     beside the hoisted 4.5.0. That is the two-copy state whose typings
 *     collision (TS2724 on the orchestrator) the override exists to prevent, and
 *     HARD 3 names it.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const PKG = '@softarc/native-federation';
const CONSUMER = '@angular-architects/native-federation';
const HOISTED_PATH = `node_modules/${PKG}`;

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

let failed = false;
const fail = (...lines) => {
  for (const line of lines) console.error(line);
  failed = true;
};

// semver.subset() THROWS on anything that is not a well-formed range string --
// a bare TypeError out of new Range(), with no context. Routing every subset()
// call through this turns that into a named FAIL: the difference between
// "someone must go read node_modules/semver" and "the message says which key in
// package.json is wrong". (semver.satisfies() does NOT throw -- it returns false
// for a bad range -- which is why the ranges are validated explicitly below
// instead of being wrapped the same way.)
const safeSubset = (sub, sup, what) => {
  try {
    return semver.subset(sub, sup);
  } catch (err) {
    fail(`FAIL: ${what}: ${err.message}`);
    return null;
  }
};

const pkg = readJson('package.json');
const rawOverride = pkg.overrides?.[PKG];

// npm accepts TWO shapes for an override value and this repo uses both:
//   "4.5.0"                       -- a bare range, applied to the package itself
//   { ".": "4.5.0", "dep": ... }  -- "." is the package itself, other keys are
//                                    sub-overrides scoped to its dependency tree
// package.json currently uses the object form for @appium/support,
// webpack-dev-server, nightwatch, mocha and @nightwatch/schematics, so someone
// editing this key by analogy will reach for it. Reading only the bare form
// meant that edit hit semver as a raw object.
let override;          // the effective self-range, or undefined
let shapeNote = '';    // '' for the bare form; names the shape otherwise
let overrideBroken = false; // the VALUE is unusable -- already reported, do not re-blame it
let nestedKeys = [];
if (rawOverride === undefined) {
  shapeNote = ' (no key declared)';
} else if (typeof rawOverride === 'string') {
  override = rawOverride;
} else if (rawOverride !== null && typeof rawOverride === 'object' && !Array.isArray(rawOverride)) {
  nestedKeys = Object.keys(rawOverride).filter((k) => k !== '.');
  const self = rawOverride['.'];
  if (self === undefined) {
    shapeNote = ` (object form with no "." key; sub-overrides only: ${nestedKeys.join(', ')})`;
  } else if (typeof self === 'string') {
    override = self;
    shapeNote = ' (object form, from the "." key)';
  } else {
    fail(`FAIL: overrides["${PKG}"]["."] is ${typeof self}, not a version range string.`);
    overrideBroken = true;
  }
} else {
  fail(
    `FAIL: overrides["${PKG}"] is ${Array.isArray(rawOverride) ? 'an array' : typeof rawOverride}, ` +
      'not a version range string, and not an object with a "." key.',
  );
  overrideBroken = true;
}

// An unparseable range must be blamed ONCE, at the key that holds it. semver's
// satisfies() silently returns false for a bad range and subset() throws, so
// without this every downstream check would re-report the same typo as a
// different package's fault.
let overrideUsable = override !== undefined;
if (override !== undefined) {
  try {
    new semver.Range(override);
  } catch (err) {
    fail(`FAIL: overrides["${PKG}"] = "${override}"${shapeNote} is not a usable semver range: ${err.message}`);
    overrideUsable = false;
    overrideBroken = true;
  }
}

// The authoritative constraint: what @angular-architects actually asks for.
// Prefer the installed manifest, fall back to the lockfile. NOT a pre-install
// mode -- see the reachability note at HARD 2; the fallback is reached when
// node_modules exists but the consumer is not hoisted where this expects it.
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
// Same reason as the override: semver.satisfies() returns FALSE for an
// unparseable range rather than throwing, so without this an unreadable
// consumer range would be reported as "the tree does not satisfy it" -- a true
// sentence pointing at the wrong file.
try {
  new semver.Range(required);
} catch (err) {
  console.error(
    `FAIL: ${CONSUMER} declares an unusable ${PKG} range "${required}" (per ${requiredFrom}): ${err.message}`,
  );
  process.exit(1);
}

// Read once; HARD 2 and HARD 3 both need it. A lockfile this gate cannot parse
// is itself a failure -- it is the file the whole contract is written in.
let lock;
try {
  lock = readJson('package-lock.json');
} catch (err) {
  console.error(`FAIL: cannot read package-lock.json: ${err.message}`);
  process.exit(1);
}

// --- HARD 1: the override must permit ONLY versions the consumer accepts. ---
if (overrideBroken) {
  // Already failed above with the precise reason; adding a second verdict about
  // a value semver cannot even parse would only bury it.
} else if (override === undefined) {
  console.log(
    `OK: no self-range in overrides["${PKG}"]${shapeNote} -- nothing to keep in sync. ` +
      `${CONSUMER} requires ${required} (per ${requiredFrom}).`,
  );
  console.log(
    '    A REMOVED override is not silently accepted: HARD 3 below fails once the ' +
      'lockfile is regenerated (a second, nested copy appears), and `npm ci` fails ' +
      'first if it has not been ("Missing: ... from lock file").',
  );
} else if (safeSubset(override, required, `overrides["${PKG}"] = "${override}"`) === false) {
  fail(
    `FAIL: overrides["${PKG}"] = "${override}"${shapeNote} is not a subset of ` +
      `"${required}", which ${CONSUMER} requires (per ${requiredFrom}).`,
    '      npm applies overrides WITHOUT resolution, so this installs and, if the ' +
      'drift is small, builds -- green and wrong. Raise the override in package.json ' +
      'and re-run `npm install` to regenerate the lockfile.',
  );
} else {
  console.log(`OK: overrides["${PKG}"] = "${override}" satisfies "${required}" (${CONSUMER}).`);
}

// --- HARD 2: the resolved version must agree with the consumer AND the override. ---
// Catches the other half: override raised but the lockfile never regenerated,
// which npm install against a committed lockfile will happily reproduce.
//
// REACHABILITY, measured -- so this block is not credited with a mode it does
// not have: the gate cannot run before an install AT ALL. It resolves `semver`
// out of node_modules and, when that fails, exits 1 at the top with the loud
// message rather than continuing. So there is no pre-install path here to keep
// honest, and correspondingly no branch below that exits 0 having checked
// nothing. The lockfile lookup exists only to NAME the version that should have
// been on disk, which makes the failure diagnosable instead of merely red.
let installed;
let onDisk = true;
try {
  installed = readJson(`${HOISTED_PATH}/package.json`).version;
} catch {
  onDisk = false;
  installed = lock.packages?.[HOISTED_PATH]?.version;
}

if (!onDisk) {
  fail(
    installed === undefined
      ? `FAIL: ${PKG} is neither on disk at ${HOISTED_PATH} nor recorded in package-lock.json.`
      : `FAIL: package-lock.json records ${PKG}@${installed} at ${HOISTED_PATH}, but nothing is ` +
        'there on disk. The tree that would be built is not the tree the lockfile describes; ' +
        're-run `npm ci`.',
    '      This gate does NOT skip here. It used to: the line was "SKIP: ... is not ' +
      'installed" followed by exit 0 -- a fail-open path in a fail-closed script, and the ' +
      'same shape as the semver branch above that this file already refused to make.',
  );
} else if (!semver.satisfies(installed, required)) {
  fail(
    `FAIL: the hoisted ${PKG} on disk is ${installed}, which does not satisfy "${required}" ` +
      `(required by ${CONSUMER}). The lockfile is stale relative to package.json -- re-run ` +
      '`npm install` and commit package-lock.json.',
  );
} else if (overrideUsable && !semver.satisfies(installed, override)) {
  // The check this section's header always claimed and never made. It compared
  // the disk against the CONSUMER RANGE only, so an override of "4.5.0" against
  // a resolved 4.5.9 printed `OK: ... satisfying "~4.5.0"` and exited 0 -- a
  // lockfile that does not honour the pin, passing the gate whose whole subject
  // is the pin.
  fail(
    `FAIL: the hoisted ${PKG} on disk is ${installed}, which does not satisfy the override ` +
      `"${override}" -- even though it does satisfy the consumer range "${required}".`,
    '      The override is the tighter promise and the lockfile has drifted off it inside ' +
      'the consumer range. Re-run `npm install` and commit package-lock.json, or widen the ' +
      'override deliberately.',
  );
} else {
  console.log(
    `OK: hoisted ${PKG} on disk is ${installed}, satisfying "${required}"` +
      (overrideUsable ? ` and the override "${override}".` : '.'),
  );
}

// --- HARD 3: the lockfile must record EXACTLY ONE copy. ---
// This is the constraint the override exists to enforce, and until now nothing
// asserted it: deleting overrides["@softarc/native-federation"] left HARD 1 and
// HARD 2 both printing OK. Measured above -- regenerating the lockfile without
// the key produces a second, nested 4.1.3 under native-federation-node, which is
// the TS2724 typings collision.
const copies = Object.keys(lock.packages ?? {}).filter((p) =>
  p === HOISTED_PATH || p.endsWith(`/${HOISTED_PATH}`),
);
if (copies.length === 1) {
  console.log(`OK: package-lock.json records exactly one copy of ${PKG} (${copies[0]}).`);
} else if (copies.length === 0) {
  fail(
    `FAIL: package-lock.json records NO copy of ${PKG}, but ${CONSUMER} requires "${required}".`,
  );
} else {
  fail(
    `FAIL: package-lock.json records ${copies.length} copies of ${PKG}:`,
    ...copies.map((p) => `        ${p}  ${lock.packages[p]?.version}`),
    '      Collapsing these onto one is the ONLY reason the override exists. Two copies ' +
      'compile to TS2724 on the @softarc orchestrator typings. Restore or raise ' +
      `overrides["${PKG}"] in package.json and re-run \`npm install\`.`,
  );
}

// --- REPORT: every OTHER declared consumer of the overridden package. ---
// The override is tree-wide, so it has more than one victim. Print them so the
// second constraint cannot be forgotten by anyone reading only _overridesNote.
try {
  // `forced` is what the tree is actually pinned to. If the override itself is
  // unparseable that was reported at HARD 1; comparing every consumer against it
  // here would print the same typo N more times, each blaming a different
  // package. So fall back to the resolved version, which is always a concrete
  // one.
  const forced = overrideUsable ? override : installed;
  const others = [];
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    const range = meta?.dependencies?.[PKG] ?? meta?.peerDependencies?.[PKG];
    if (!range) continue;
    const name = meta.name ?? path.split('node_modules/').pop();
    if (name === CONSUMER || path === '') continue;
    let ok = true;
    if (forced) {
      const verdict = safeSubset(forced, range, `${name} declares an unusable range "${range}"`);
      ok = verdict === null ? true : verdict;
    }
    others.push({ name, range, ok });
  }
  if (others.length) {
    console.log(`\nOther declared consumers of ${PKG} (the override applies to these too):`);
    for (const o of others) {
      console.log(`  ${o.ok ? 'ok         ' : 'FORCED PAST'} ${o.name} requires "${o.range}"`);
      if (!o.ok && !TOLERATED_FORCED_PAST.has(o.name)) {
        fail(
          `FAIL: ${o.name} requires "${o.range}" and is forced to "${forced}" by the ` +
            'override. It is not in TOLERATED_FORCED_PAST in this script. Either drop ' +
            'the override, drop that dependency, or justify it in the list.',
        );
      }
    }
  }
  if (nestedKeys.length) {
    console.log(
      `\nNOTE: overrides["${PKG}"] also carries sub-overrides for ${nestedKeys.join(', ')}. ` +
        'This gate checks the "." self-range only.',
    );
  }
} catch (err) {
  // Informational half only -- never turn a lockfile parse hiccup into a red CI.
  console.log(`(could not enumerate other consumers: ${err.message})`);
}

process.exit(failed ? 1 : 0);
