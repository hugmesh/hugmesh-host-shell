#!/usr/bin/env node
/**
 * check-lockfile-sources.mjs
 *
 * Every package the install fetches must come from the npm registry AND carry an
 * integrity hash. Anything else is rejected, and an entry this script cannot
 * classify is rejected too (fail CLOSED).
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
 *   1. every locked package resolves to https://registry.npmjs.org/ (host compared
 *      after URL parsing, so userinfo, ports, lookalike hosts and scheme or case
 *      spellings of the same string do not slip through);
 *   2. every such entry has an integrity hash (sha256, sha384 or sha512 only);
 *   3. no entry has a missing, relative or non-URL `resolved`, except `link`
 *      entries and packages bundled inside another tarball (`inBundle`);
 *   4. no dependency SPEC, in the lockfile or in package.json (dependencies,
 *      devDependencies, optionalDependencies, peerDependencies, overrides), is a
 *      git, URL, file or owner/repo shorthand spec. `npm:` aliases are looked
 *      through to their real spec.
 *
 * Lockfile and package.json only, node built-ins only: it runs before `npm ci`
 * with no node_modules at all. Reads ./package-lock.json and ./package.json.
 * Run locally with:  node scripts/check-lockfile-sources.mjs
 * Its RED tests:     node --test scripts/check-lockfile-sources.test.mjs
 */
import fs from 'node:fs';

const ALLOWED_REGISTRY_HOSTS = new Set(['registry.npmjs.org']);
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const STRONG_INTEGRITY = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

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

/** Why this resolved URL is not an acceptable registry source, or null if it is. */
function badResolved(resolved) {
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
  if (s.includes('/')) return `spec is a URL, path or owner/repo shorthand: ${spec}`;
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

function findProblems(lock, pkg) {
  const problems = [];
  const packages = lock?.packages;
  if (!packages || typeof packages !== 'object') {
    return ['package-lock.json has no `packages` map (lockfileVersion < 2?); it cannot be verified'];
  }
  for (const [path, entry] of Object.entries(packages)) {
    const label = path === '' ? '(root)' : path;
    if (path !== '' && !entry?.link && !entry?.inBundle) {
      const r = badResolved(entry?.resolved) ?? badIntegrity(entry?.integrity);
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
if (problems.length) {
  console.error(`FAIL: ${problems.length} dependency source problem(s); every install must come from the npm registry with an integrity hash:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
const n = Object.keys(lock.packages).length - 1;
console.log(`OK: ${n} locked packages, all resolved from the npm registry with integrity; no git, URL or path specs.`);
