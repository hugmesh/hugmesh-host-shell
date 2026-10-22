/**
 * runtime-lock.mjs
 *
 * Works out the RUNTIME dependency tree from package.json and
 * package-lock.json without trusting what the lockfile says about itself.
 *
 * WHY (issue #72, round 3). Both runtime gates used to take the lockfile's
 * word for which entries are runtime: `npm audit --omit=dev` drops every entry
 * flagged `"dev": true`, and the floor test skipped the same entries. Nothing
 * checks those flags. `npm ci` installs every entry (dev ones included, which
 * is what the Dockerfile runs) and Node resolves `require()` by directory, so
 * a committed lock could carry a vulnerable runtime package flagged dev and
 * both gates passed it. The same goes for `version`: npm audit asks about the
 * lock's `version`, while `npm ci` installs whatever `resolved` names and
 * `integrity` matches, so `version: 2.0.8` beside the 2.0.7 tarball installed
 * 2.0.7 and audited clean.
 *
 * WHAT. runtimeTree() starts at package.json's `dependencies` and
 * `optionalDependencies` (and `peerDependencies`, unless the project's .npmrc
 * sets legacy-peer-deps, under which npm ignores peers), and resolves each
 * name the way Node and npm do over the lock's paths
 * (`<pkg>/node_modules/<name>`, then each enclosing package's node_modules,
 * then the top `node_modules/<name>`). From every entry it reaches it follows
 * that entry's `dependencies` and `optionalDependencies` (and peers, on the
 * same rule; npm does not install a dependency's own devDependencies). The
 * stored `dev`/`optional` flags play no part in reachability. lockProblems()
 * then reports, for the entries reached:
 *   - a `dev: true` flag (npm audit --omit=dev would skip a runtime package);
 *   - a missing `version`, or a `resolved` that is not the public registry's
 *     tarball for exactly this name and version, or no `integrity` (what the
 *     audit reads would not be what `npm ci` installs);
 *   - a `link` entry (npm audit skips links and their targets);
 *   - a non-optional dependency the lock does not hold;
 * and, for the root, any disagreement between package.json and the lock's own
 * root entry about which names are runtime dependencies.
 *
 *   import { runtimeTree, lockProblems } from './runtime-lock.mjs';
 * Its tests: node --test scripts/runtime-lock-floors.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

export const REGISTRY = 'https://registry.npmjs.org/';

const RUNTIME_DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * Whether npm follows peerDependencies for this project. With
 * `legacy-peer-deps=true` (this repo's .npmrc) npm loads no peer edges at all,
 * so a package reached only through a peer is not installed for it and npm
 * flags it by whatever else needs it. Without that setting peers count, and
 * the walk follows them. Anything unreadable counts as "peers count", which
 * is the stricter answer.
 */
export function followsPeers(dir) {
  let rc = '';
  try {
    rc = fs.readFileSync(path.join(dir, '.npmrc'), 'utf8');
  } catch {
    return true;
  }
  return !/^\s*legacy-peer-deps\s*=\s*true\s*$/m.test(rc);
}

/** The lock key Node would load `name` from, starting at the package at `from` ('' is the root). */
export function resolveIn(packages, from, name) {
  let base = from;
  for (;;) {
    const at = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (Object.hasOwn(packages, at)) return at;
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i === -1 ? '' : base.slice(0, i);
  }
}

/** The package name a lock key installs, e.g. node_modules/a/node_modules/@s/b -> @s/b. */
export function nameAt(at) {
  const i = at.lastIndexOf('node_modules/');
  return i === -1 ? path.posix.basename(at) : at.slice(i + 'node_modules/'.length);
}

/** The public-registry tarball URL for name@version. */
export function registryTarball(name, version) {
  const file = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name;
  return `${REGISTRY}${name}/-/${file}-${version}.tgz`;
}

/** Each dependency an entry declares: [{ name, optional }]. */
function edgesOf(pkg, peers) {
  const out = new Map();
  const meta = pkg.peerDependenciesMeta ?? {};
  for (const field of RUNTIME_DEP_FIELDS) {
    if (field === 'peerDependencies' && !peers) continue;
    for (const name of Object.keys(pkg[field] ?? {})) {
      const optional =
        field === 'optionalDependencies' || (field === 'peerDependencies' && meta[name]?.optional === true);
      // A name in both `dependencies` and `optionalDependencies` is optional,
      // as npm treats it; a required spelling anywhere else wins.
      const prev = out.get(name);
      out.set(name, { name, optional: prev ? prev.optional && optional : optional });
    }
  }
  return [...out.values()];
}

/**
 * Walk the runtime tree. Returns { reached: Map<lockKey, parentKey>, missing: [string] }.
 * `pkgJson` supplies the root's dependencies; `lock` is the parsed package-lock.json;
 * `peers` says whether peerDependencies are followed (see followsPeers).
 */
export function runtimeTree(pkgJson, lock, { peers = true } = {}) {
  const packages = lock.packages ?? {};
  const reached = new Map();
  const missing = [];
  const queue = [];
  const visit = (from, fromPkg) => {
    for (const { name, optional } of edgesOf(fromPkg, peers)) {
      const at = resolveIn(packages, from, name);
      if (at === null) {
        // A peer may be satisfied by nothing the lock holds (an optional
        // peer, or a peer npm leaves to the host); a plain dependency may not.
        if (!optional) missing.push(`${from || '(root)'} needs ${name}, which the lockfile does not hold`);
        continue;
      }
      if (!reached.has(at)) {
        reached.set(at, from);
        queue.push(at);
      }
    }
  };
  visit('', pkgJson);
  while (queue.length) {
    const at = queue.shift();
    const entry = packages[at] ?? {};
    // A link's dependencies are its target's.
    if (entry.link === true && typeof entry.resolved === 'string' && packages[entry.resolved]) {
      if (!reached.has(entry.resolved)) {
        reached.set(entry.resolved, at);
        queue.push(entry.resolved);
      }
      continue;
    }
    visit(at, entry);
  }
  return { reached, missing };
}

/** The chain of lock keys that reaches `at` from the root, for messages. */
function chain(reached, at) {
  const out = [];
  for (let k = at; k; k = reached.get(k)) out.unshift(nameAt(k));
  return out.join(' > ');
}

/** Everything wrong with a lockfile's runtime tree, as readable strings. Empty means clean. */
export function lockProblems(pkgJson, lock, { peers = true } = {}) {
  const problems = [];
  const packages = lock.packages;
  if (!packages || typeof packages !== 'object') {
    return ['package-lock.json has no "packages" map (lockfileVersion 2 or 3 is required)'];
  }

  // The root entry must agree with package.json about what is runtime.
  const root = packages[''] ?? {};
  for (const field of RUNTIME_DEP_FIELDS) {
    if (field === 'peerDependencies' && !peers) continue;
    const a = Object.keys(pkgJson[field] ?? {}).sort().join(',');
    const b = Object.keys(root[field] ?? {}).sort().join(',');
    if (a !== b) problems.push(`package.json ${field} [${a}] and the lockfile root entry [${b}] disagree`);
  }

  // Walk from package.json AND from the lock's root entry, so a name either
  // one calls runtime is treated as runtime.
  const fromPkg = runtimeTree(pkgJson, lock, { peers });
  const fromLock = runtimeTree(root, lock, { peers });
  const reached = new Map([...fromLock.reached, ...fromPkg.reached]);
  problems.push(...new Set([...fromPkg.missing, ...fromLock.missing]));

  for (const at of [...reached.keys()].sort()) {
    const e = packages[at];
    const via = chain(reached, at);
    if (!e || typeof e !== 'object') {
      problems.push(`${at} (${via}) has no lockfile entry`);
      continue;
    }
    if (e.link === true) {
      problems.push(`${at} (${via}) is a link; npm audit does not audit links or their targets`);
      continue;
    }
    if (e.dev === true) {
      problems.push(`${at} (${via}) is on the runtime path but flagged "dev": true, so npm audit --omit=dev skips it`);
    }
    const name = typeof e.name === 'string' ? e.name : nameAt(at);
    if (typeof e.version !== 'string' || e.version === '') {
      problems.push(`${at} (${via}) has no version`);
      continue;
    }
    const want = registryTarball(name, e.version);
    if (e.resolved !== want) {
      problems.push(
        `${at} (${via}) says ${name}@${e.version} but resolves to ${e.resolved ?? '(nothing)'}; ` +
          `npm audit reads the version, npm ci installs the tarball (expected ${want})`,
      );
    }
    if (typeof e.integrity !== 'string' || !/^sha512-/.test(e.integrity)) {
      problems.push(`${at} (${via}) has no sha512 integrity`);
    }
  }
  return problems;
}

/** The set of lock keys on the runtime path (package.json and lock root both counted). */
export function runtimeKeys(pkgJson, lock, { peers = true } = {}) {
  const a = runtimeTree(pkgJson, lock, { peers }).reached;
  const b = runtimeTree(lock.packages?.[''] ?? {}, lock, { peers }).reached;
  return new Set([...a.keys(), ...b.keys()]);
}

/** Read package.json, package-lock.json and the peer setting from a directory. */
export function readProject(dir) {
  return {
    pkgJson: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')),
    lock: JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8')),
    peers: followsPeers(dir),
  };
}
