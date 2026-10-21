#!/usr/bin/env node
/**
 * check-lockfile-sources.mjs
 *
 * Every locked package must resolve to the npm registry tarball of ITS OWN name
 * and version, and carry an integrity hash, and nothing the repo controls may
 * point npm at a different place to fetch that registry URL from (./.npmrc,
 * checks 6 and 7). Anything else is rejected, and an entry key, lockfile
 * version, manifest field or config line this script cannot classify is
 * rejected too (fail CLOSED). The hash alone proves nothing here: whoever edits
 * the lockfile also writes the hash, so it only has to match their own tarball.
 * What makes the hash worth something is the URL: a registry tarball URL names
 * one immutable name@version, so a hash for different bytes fails EINTEGRITY.
 *
 * WHY. The lockfile used to record
 *   node_modules/download -> git+ssh://git@github.com/garg3133/download.git#<sha>
 * with no `integrity`, reached through the dev-only @nightwatch/mobile-helper.
 * `npm ci` fetched that as a tarball from codeload.github.com/garg3133/download
 * (measured, npm 12.2.0 with --allow-git=all) and installed whatever that
 * personal fork served at the commit, with nothing to verify it against. A git
 * dependency also runs its `prepare` script at install time. npm 12 refuses git
 * sources by default (EALLOWGIT), so the same lockfile did not even install there.
 *
 * WHAT IT CHECKS, in ./package-lock.json and ./package.json:
 *   1. every locked package resolves to EXACTLY
 *        https://registry.npmjs.org/<name>/-/<basename>-<version>.tgz
 *      where <name> is the text after the last `node_modules/` in the entry's
 *      key (`@scope/pkg` for a scoped package, whose basename is `pkg`) and
 *      <version> is the entry's own `version`. Host compared after URL parsing,
 *      so userinfo, ports, lookalike hosts and scheme or case spellings of the
 *      same string do not slip through; no query, fragment, percent-escape or
 *      backslash is accepted. Round 4 (measured, npm 11.16.0 and 12.2.0): an
 *      entry `node_modules/isarray` with `resolved` set to
 *      https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz and
 *      is-number's own integrity passed a host-only check, and `npm ci
 *      --ignore-scripts --registry=https://registry.npmjs.org/` installed
 *      is-number's code as `isarray`. Anyone can publish to npm, so a host-only
 *      check let a two-line lockfile edit install any published tarball under a
 *      trusted name. The key must be a plain chain of `node_modules/<name>`
 *      segments with a lower-case npm name, and the version must be strict
 *      semver; anything else is refused rather than guessed at.
 *      NOT CLOSED: a rollback to an OLDER real version of the SAME package (the
 *      version field is attacker-written too, and only the registry's own
 *      metadata could say which version a transitive parent asked for). Those
 *      bytes are the genuine published package; `npm audit` and the runtime
 *      audit gate are what catch a known-vulnerable one;
 *   2. every such entry has an integrity hash (sha256, sha384 or sha512 only);
 *   3. no entry has a missing, relative or non-URL `resolved`, and every entry
 *      key is on an ALLOWLIST (ENTRY_KEYS below: the keys npm writes for a plain
 *      registry package). That refuses npm 12's `patched` key (measured: npm
 *      12.2.0 applied a repo patch file under --ignore-scripts and the round-3
 *      gate accepted it), an alias's `name` key (none today; an alias would
 *      have to be accepted deliberately here) and any key npm adds later. The
 *      lockfile must be lockfileVersion 2 or 3, and package.json may not carry
 *      patchedDependencies, packageExtensions or workspaces. There is NO
 *      exemption: an entry carrying a `link` or `inBundle` key, or one that is not
 *      a JSON object, is rejected outright. npm installs a git-resolved entry
 *      marked `"inBundle": true` from its git source like any other (measured:
 *      npm 11.16.0 `npm ci --ignore-scripts` and npm 12.2.0 `--allow-git=all`,
 *      the latter running the package's prepare and postinstall), so exempting
 *      those keys let one added JSON key carry the original exploit past this
 *      gate. This repo has no workspaces and no bundled dependencies; if it ever
 *      needs them, accept them here deliberately, never by key alone;
 *   4. no dependency SPEC, in the lockfile or in package.json (dependencies,
 *      devDependencies, optionalDependencies, peerDependencies, overrides), is a
 *      git, URL, file, directory or owner/repo shorthand spec. That includes
 *      every spelling npm-package-arg reads as a path even without a slash: a
 *      leading `.` (`.`, `..`, `.evil-dir`), `~/`, a backslash anywhere, or a
 *      name ending .tgz, .tar.gz or .tar. `npm:` aliases are looked through to
 *      their real spec;
 *   5. there is no npm-shrinkwrap.json (any letter case) in the directory. npm
 *      11 PREFERS it over package-lock.json (measured: npm 11.16.0 `npm ci`
 *      installed a git package from a shrinkwrap while package-lock.json was
 *      clean), and this script reads only package-lock.json;
 *   6. ./.npmrc (the project config npm reads before `npm ci`, and which the
 *      Dockerfile copies in) holds nothing but blank lines, comment lines and
 *      `legacy-peer-deps=true`. It is an ALLOWLIST, not a list of bad keys:
 *      `registry=http://127.0.0.1:<port>/` alone made npm fetch
 *      https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz from that host
 *      instead (npm's default replace-registry-host=npmjs rewrites it), and a
 *      lockfile whose integrity was the attacker's own tarball installed it
 *      (measured, npm 12.2.0, round 3). Quoted keys, proxies, CAs, strict-ssl,
 *      scoped registries, ${VAR} values and keys this script has never heard of
 *      are all refused the same way. A missing .npmrc is fine; one that exists
 *      but cannot be read exits 2;
 *   7. no npm_config_* / NPM_CONFIG_* environment variable (any case, `-` or
 *      `_`) sets registry, <scope>:registry, replace-registry-host, proxy,
 *      http-proxy, https-proxy, strict-ssl, ca or cafile to anything but npm's
 *      default. The environment comes from the Dockerfile and the CI job, not
 *      from .npmrc, so this is a named list; the install lines ALSO pass
 *      --registry=https://registry.npmjs.org/ on the command line, which
 *      overrides both .npmrc and the environment for the top-level registry.
 *      NOT CHECKED: npm_config_userconfig / globalconfig / cache, the user and
 *      global npmrc files those name, and non-npm variables such as
 *      HTTPS_PROXY, NODE_TLS_REJECT_UNAUTHORIZED or NODE_EXTRA_CA_CERTS. Those
 *      come from the image and the CI runner, not from this repository.
 *
 * Lockfile and package.json only, node built-ins only: it runs before `npm ci`
 * with no node_modules at all. Reads ./package-lock.json, ./package.json,
 * ./.npmrc and the environment.
 * Run locally with:  node scripts/check-lockfile-sources.mjs
 * Its RED tests:     node --test scripts/check-lockfile-sources.test.mjs
 */
import fs from 'node:fs';

const ALLOWED_REGISTRY_HOSTS = new Set(['registry.npmjs.org']);
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const STRONG_INTEGRITY = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const REGISTRY_ORIGIN = 'https://registry.npmjs.org';
// One lower-case npm package name, optionally scoped. Legacy upper-case names
// are refused (none are locked today); add them deliberately if ever needed.
const NAME_PART = '[a-z0-9~-][a-z0-9._~-]*';
const PKG_NAME = `(?:@${NAME_PART}/)?${NAME_PART}`;
// A lockfile key: one or more `node_modules/<name>` segments, nothing else.
const ENTRY_PATH = new RegExp(`^(?:node_modules/${PKG_NAME}/)*node_modules/(${PKG_NAME})$`);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
// The keys npm writes on a plain registry entry. Anything else (npm 12's
// `patched`, an alias's `name`, `link`, `inBundle`, `hasShrinkwrap`,
// `bundleDependencies`, a key npm invents later) is refused.
const ENTRY_KEYS = new Set([
  'version', 'resolved', 'integrity', 'license', 'dev', 'optional', 'devOptional', 'peer',
  'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta',
  'engines', 'os', 'cpu', 'libc', 'bin', 'funding', 'deprecated', 'hasInstallScript',
]);
// package.json fields that change WHAT npm installs without a dependency spec.
const MANIFEST_REFUSED = ['patchedDependencies', 'packageExtensions', 'workspaces'];

function readJson(file, why) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    fail(`cannot read ./${file} (${e.code ?? e.message}); ${why}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(`./${file} is not valid JSON (${e.message}); ${why}`);
  }
}

function fail(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(2);
}

/**
 * Why this entry's resolved URL is not the registry tarball of the entry's own
 * name and version, or null if it is.
 */
function badResolved(resolved, key, version) {
  if (typeof resolved !== 'string' || resolved === '') return 'has no `resolved` URL';
  let u;
  try {
    u = new URL(resolved);
  } catch {
    return `resolved is not an absolute URL: ${resolved}`;
  }
  if (u.protocol !== 'https:') return `resolved uses ${u.protocol} (only https from the registry is allowed): ${resolved}`;
  if (u.username || u.password) return `resolved carries credentials or userinfo: ${resolved}`;
  if (u.port) return `resolved names a port: ${resolved}`;
  if (!ALLOWED_REGISTRY_HOSTS.has(u.hostname)) return `resolved host ${u.hostname} is not the npm registry: ${resolved}`;
  // From here the URL is on the registry; it must be THIS entry's tarball.
  const m = ENTRY_PATH.exec(key);
  if (!m) return `key is not a plain node_modules/<lower-case npm name> path, so its registry tarball cannot be derived: ${key}`;
  const name = m[1];
  if (typeof version !== 'string' || !SEMVER.test(version)) return `version ${JSON.stringify(version)} is not a plain semver version, so its registry tarball cannot be derived`;
  const expected = `${REGISTRY_ORIGIN}/${name}/-/${name.split('/').pop()}-${version}.tgz`;
  // Compare the text as written as well as the parsed URL, so no dot segment,
  // escape or backslash that a URL parser would normalise can stand in for it.
  // Only the scheme and host may differ, and only in letter case.
  const asWritten = resolved.slice(0, REGISTRY_ORIGIN.length).toLowerCase() === REGISTRY_ORIGIN
    && resolved.slice(REGISTRY_ORIGIN.length) === expected.slice(REGISTRY_ORIGIN.length);
  // The parsed comparison is a second line behind the name and version rules
  // above: if either is ever loosened, a dot segment hidden in a version still
  // normalises to a different href and is refused here.
  if (!asWritten || u.href !== expected) {
    return `resolved is not ${name}@${version}'s own registry tarball (expected ${expected}); a different tarball installs under this name: ${resolved}`;
  }
  return null;
}

/** Why this integrity value is not acceptable, or null if it is. */
function badIntegrity(integrity) {
  if (typeof integrity !== 'string' || integrity.trim() === '') return 'has no integrity hash';
  const parts = integrity.trim().split(/\s+/);
  for (const p of parts) if (!STRONG_INTEGRITY.test(p)) return `integrity is not sha256/384/512: ${p.slice(0, 24)}`;
  return null;
}

/** Why this dependency spec is not a plain registry range/tag, or null if it is. */
function badSpec(spec) {
  if (typeof spec !== 'string') return `spec is not a string: ${JSON.stringify(spec)}`;
  let s = spec.trim();
  const alias = /^npm:(@?[^@]+)(?:@(.*))?$/.exec(s);
  if (/^npm:/i.test(s)) {
    if (!alias) return `unparseable npm: alias spec: ${spec}`;
    s = (alias[2] ?? '').trim();
  }
  if (s.includes('/') || s.includes('\\')) return `spec is a URL, path or owner/repo shorthand: ${spec}`;
  // npm-package-arg reads these as a directory or tarball path with no slash at all.
  if (/^(?:\.|~\/)/.test(s) || /\.(?:tgz|tar\.gz|tar)$/i.test(s)) return `spec is a file or directory path: ${spec}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return `spec uses a ${s.split(':')[0]}: source: ${spec}`;
  return null;
}

function* specsOf(obj, where) {
  for (const sec of DEP_SECTIONS) {
    for (const [name, spec] of Object.entries(obj?.[sec] ?? {})) yield [`${where} ${sec}.${name}`, spec];
  }
}

function* overrideSpecs(node, where) {
  for (const [k, v] of Object.entries(node ?? {})) {
    if (v && typeof v === 'object') yield* overrideSpecs(v, `${where}.${k}`);
    else yield [`${where}.${k}`, v];
  }
}

// The ONLY lines ./.npmrc may hold. Anything else, however spelled, is refused.
const NPMRC_ALLOWED = [/^\s*$/, /^\s*[#;]/, /^[ \t]*legacy-peer-deps[ \t]*=[ \t]*true[ \t]*$/];

function npmrcProblems() {
  let text;
  try {
    text = fs.readFileSync('.npmrc', 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    fail(`./.npmrc exists but cannot be read (${e.code ?? e.message}); it can redirect every fetch, so it must be checked`);
  }
  const problems = [];
  // Split exactly as npm's ini parser does, on EITHER \r or \n: splitting on \n
  // alone would read "# note\rregistry=..." as one comment line, while npm reads
  // the registry line after the bare carriage return.
  text.split('\n').forEach((physical, i) => {
    for (const line of physical.split('\r')) {
      if (NPMRC_ALLOWED.some((re) => re.test(line))) continue;
      problems.push(`./.npmrc line ${i + 1}: ${JSON.stringify(line.slice(0, 80))} is not allowed; only \`legacy-peer-deps=true\`, comments and blank lines are (a registry, proxy, CA or any other setting there can make npm fetch the registry URLs in the lockfile from somewhere else)`);
    }
  });
  return problems;
}

// npm config keys that change WHERE a registry tarball is fetched from, or
// whether TLS is verified, with the value npm uses when they are unset.
const ENV_DEFAULTS = {
  'registry': ['https://registry.npmjs.org/', 'https://registry.npmjs.org'],
  'replace-registry-host': ['npmjs'],
  'proxy': [''],
  'http-proxy': [''],
  'https-proxy': [''],
  'strict-ssl': ['', 'true'],
  'ca': [''],
  'cafile': [''],
};

function envProblems(env) {
  const problems = [];
  for (const [name, value] of Object.entries(env)) {
    const m = /^npm_config_(.+)$/i.exec(name);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/_/g, '-');
    const allowed = key.endsWith(':registry') ? [] : ENV_DEFAULTS[key];
    if (!allowed) continue;
    if (!allowed.includes(String(value).trim())) {
      problems.push(`environment ${name}=${JSON.stringify(String(value).slice(0, 80))} changes where npm fetches from (or whether it checks TLS); unset it`);
    }
  }
  return problems;
}

function findProblems(lock, pkg) {
  const problems = [];
  const packages = lock?.packages;
  if (!packages || typeof packages !== 'object') {
    return ['package-lock.json has no `packages` map (lockfileVersion < 2?); it cannot be verified'];
  }
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
    problems.push(`package-lock.json lockfileVersion ${JSON.stringify(lock.lockfileVersion)} is not 2 or 3; a newer format can carry fields this script does not know (npm 12's v4 \`patched\`)`);
  }
  for (const field of MANIFEST_REFUSED) {
    if (pkg && typeof pkg === 'object' && Object.hasOwn(pkg, field)) {
      problems.push(`package.json has \`${field}\`; it changes what npm installs without a dependency spec, and is not accepted`);
    }
  }
  for (const [path, entry] of Object.entries(packages)) {
    const label = path === '' ? '(root)' : path;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${label}: entry is not a JSON object (${JSON.stringify(entry)?.slice(0, 40)}); it cannot be verified`);
      continue;
    }
    if (path !== '') {
      for (const key of ['link', 'inBundle']) {
        if (Object.hasOwn(entry, key)) problems.push(`${label}: has a \`${key}\` key; link and bundled entries are not accepted (npm still installs them from their \`resolved\` source)`);
      }
      const unknown = Object.keys(entry).filter((k) => !ENTRY_KEYS.has(k) && k !== 'link' && k !== 'inBundle');
      if (unknown.length) problems.push(`${label}: has key(s) ${unknown.map((k) => `\`${k}\``).join(', ')} that a plain registry entry does not carry; refused (npm 12 \`patched\` rewrites the installed code, \`name\` installs an alias)`);
      const r = badResolved(entry.resolved, path, entry.version) ?? badIntegrity(entry.integrity);
      if (r) problems.push(`${label}: ${r}`);
    }
    for (const [where, spec] of specsOf(entry, label)) {
      const r = badSpec(spec);
      if (r) problems.push(`${where}: ${r}`);
    }
  }
  for (const [where, spec] of specsOf(pkg, 'package.json')) {
    const r = badSpec(spec);
    if (r) problems.push(`${where}: ${r}`);
  }
  for (const [where, spec] of overrideSpecs(pkg?.overrides, 'package.json overrides')) {
    const r = badSpec(spec);
    if (r) problems.push(`${where}: ${r}`);
  }
  return problems;
}

const lock = readJson('package-lock.json', 'refusing to install from a lockfile that cannot be read');
const pkg = readJson('package.json', 'refusing to install without its manifest');
const problems = findProblems(lock, pkg);
let here;
try {
  here = fs.readdirSync('.');
} catch (e) {
  fail(`cannot list the working directory (${e.code ?? e.message}); cannot rule out an npm-shrinkwrap.json`);
}
for (const f of here) {
  if (f.toLowerCase() === 'npm-shrinkwrap.json') {
    problems.push(`./${f} exists; npm 11 installs from it INSTEAD of package-lock.json, and only package-lock.json is checked. Delete it.`);
  }
}
problems.push(...npmrcProblems(), ...envProblems(process.env));
if (problems.length) {
  console.error(`FAIL: ${problems.length} dependency source problem(s); every install must come from the npm registry with an integrity hash:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
const n = Object.keys(lock.packages).length - 1;
console.log(`OK: ${n} locked packages, each resolved to its own name@version tarball on the npm registry with integrity; no git, URL or path specs; no npm-shrinkwrap.json; no registry, proxy or TLS override in ./.npmrc or the npm_config_* variables checked.`);
