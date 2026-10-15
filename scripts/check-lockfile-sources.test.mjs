// RED tests for scripts/check-lockfile-sources.mjs.
//
//   node --test scripts/check-lockfile-sources.test.mjs
//
// Plain node:test, built-ins only, so it runs before `npm ci`. Every case runs
// the REAL script as a child process in a fresh temp directory holding a copy of
// this repo's committed package-lock.json and package.json with ONE mutation, so
// the fixtures track the real tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(HERE, 'check-lockfile-sources.mjs');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const KEY = 'node_modules/download';
const GIT_SSH = 'git+ssh://git@github.com/garg3133/download.git#a58658fbae679bf632c4acc1c44eb1ff614d84cc';

function run({ lock = readJson('package-lock.json'), pkg = readJson('package.json'), lockText, pkgText } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-sources-'));
  try {
    if (lockText !== null) fs.writeFileSync(path.join(dir, 'package-lock.json'), lockText ?? JSON.stringify(lock));
    if (pkgText !== null) fs.writeFileSync(path.join(dir, 'package.json'), pkgText ?? JSON.stringify(pkg));
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const withEntry = (entry, key = KEY) => {
  const lock = readJson('package-lock.json');
  lock.packages[key] = entry;
  return run({ lock });
};
const SHA512 = 'sha512-' + 'A'.repeat(86) + '==';
const registry = (extra = {}) => ({
  version: '14.0.0',
  resolved: 'https://registry.npmjs.org/download/-/download-14.0.0.tgz',
  integrity: SHA512,
  dev: true,
  ...extra,
});

test('the committed lockfile and manifest are clean -> exit 0', () => {
  const r = run();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /OK: \d+ locked packages/);
});

test('the committed lockfile no longer carries the git+ssh download fork', () => {
  const lock = readJson('package-lock.json');
  assert.equal(lock.packages[KEY], undefined);
  assert.equal(lock.packages['node_modules/@nightwatch/mobile-helper'], undefined);
  assert.equal(readJson('package.json').devDependencies['@nightwatch/mobile-helper'], undefined);
});

test('the exact shape that was on main: git+ssh resolved, no integrity -> exit 1, names it', () => {
  const r = withEntry({ version: '14.0.0', resolved: GIT_SSH, dev: true });
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes(`${KEY}: resolved uses git+ssh:`), r.out);
});

for (const [name, resolved] of [
  ['git+https', 'git+https://github.com/garg3133/download.git#a58658fbae679bf632c4acc1c44eb1ff614d84cc'],
  ['git://', 'git://github.com/garg3133/download.git#a58658fbae679bf632c4acc1c44eb1ff614d84cc'],
  ['github: shorthand', 'github:garg3133/download#14.0.0'],
  ['plain http registry', 'http://registry.npmjs.org/download/-/download-14.0.0.tgz'],
  ['codeload tarball', 'https://codeload.github.com/garg3133/download/tar.gz/a58658fbae679bf632c4acc1c44eb1ff614d84cc'],
  ['other host', 'https://registry.example.com/download/-/download-14.0.0.tgz'],
  ['lookalike suffix host', 'https://registry.npmjs.org.evil.example/download/-/download-14.0.0.tgz'],
  ['registry name in the path', 'https://evil.example/registry.npmjs.org/download/-/download-14.0.0.tgz'],
  ['userinfo trick', 'https://registry.npmjs.org@evil.example/download/-/download-14.0.0.tgz'],
  ['userinfo with password', 'https://registry.npmjs.org:x@evil.example/download.tgz'],
  ['userinfo on the right host', 'https://user:pw@registry.npmjs.org/download/-/download-14.0.0.tgz'],
  ['username only on the right host', 'https://x@registry.npmjs.org/download/-/download-14.0.0.tgz'],
  ['explicit port', 'https://registry.npmjs.org:8443/download/-/download-14.0.0.tgz'],
  ['file: path', 'file:../download'],
  ['relative path', '../download'],
  ['empty string', ''],
]) {
  test(`resolved ${name} (even with a valid integrity) -> exit 1`, () => {
    const r = withEntry(registry({ resolved }));
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`${KEY}: `), r.out);
  });
}

test('resolved in upper case on the registry host is the same host -> exit 0', () => {
  const r = withEntry(registry({ resolved: 'HTTPS://REGISTRY.NPMJS.ORG/download/-/download-14.0.0.tgz' }));
  assert.equal(r.status, 0, r.out);
});

test('a missing resolved -> exit 1', () => {
  const r = withEntry({ version: '14.0.0', integrity: SHA512, dev: true });
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes(`${KEY}: has no \`resolved\` URL`), r.out);
});

test('registry resolved but NO integrity -> exit 1', () => {
  const e = registry();
  delete e.integrity;
  const r = withEntry(e);
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes(`${KEY}: has no integrity hash`), r.out);
});

for (const [name, integrity] of [
  ['sha1 only', 'sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA='],
  ['md5', 'md5-AAAAAAAAAAAAAAAAAAAAAA=='],
  ['garbage', 'not-a-hash'],
  ['strong plus weak', `${SHA512} sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA=`],
  ['blank', '   '],
  ['non-string', 12345],
]) {
  test(`integrity ${name} -> exit 1`, () => {
    const r = withEntry(registry({ integrity }));
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`${KEY}: `), r.out);
  });
}

test('two strong hashes are accepted -> exit 0', () => {
  const r = withEntry(registry({ integrity: `${SHA512} sha256-${'A'.repeat(43)}=` }));
  assert.equal(r.status, 0, r.out);
});

test('a link entry and a bundled entry carry no resolved/integrity by design -> exit 0', () => {
  const lock = readJson('package-lock.json');
  lock.packages['node_modules/some-link'] = { resolved: 'packages/some-link', link: true };
  lock.packages['node_modules/a/node_modules/bundled'] = { version: '1.0.0', inBundle: true };
  const r = run({ lock });
  assert.equal(r.status, 0, r.out);
});

for (const [name, spec] of [
  ['github: shorthand', 'github:garg3133/download#14.0.0'],
  ['bare owner/repo', 'garg3133/download'],
  ['owner/repo#ref', 'garg3133/download#a58658f'],
  ['git+ssh', 'git+ssh://git@github.com/garg3133/download.git'],
  ['git+https', 'git+https://github.com/garg3133/download.git'],
  ['tarball URL', 'https://example.com/download-14.0.0.tgz'],
  ['http URL', 'http://example.com/download-14.0.0.tgz'],
  ['file:', 'file:../download'],
  ['link:', 'link:../download'],
  ['gist:', 'gist:abcdef'],
  ['relative path', '../download'],
  ['npm alias to a git spec', 'npm:download@github:garg3133/download#14.0.0'],
  ['npm alias to a URL', 'npm:download@https://example.com/d.tgz'],
  ['uppercase scheme', 'GITHUB:garg3133/download'],
]) {
  test(`a locked dependency spec ${name} -> exit 1`, () => {
    const lock = readJson('package-lock.json');
    lock.packages['node_modules/some-pkg'] = registry({ dependencies: { download: spec } });
    const r = run({ lock });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes('node_modules/some-pkg dependencies.download: '), r.out);
  });

  test(`a package.json devDependency ${name} -> exit 1`, () => {
    const pkg = readJson('package.json');
    pkg.devDependencies.download = spec;
    const r = run({ pkg });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes('package.json devDependencies.download: '), r.out);
  });
}

for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  test(`package.json ${section} with a git spec -> exit 1`, () => {
    const pkg = readJson('package.json');
    pkg[section] = { ...(pkg[section] ?? {}), download: 'github:garg3133/download#14.0.0' };
    const r = run({ pkg });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`package.json ${section}.download: `), r.out);
  });
}

test('a git spec in package.json overrides, flat and nested -> exit 1', () => {
  let pkg = readJson('package.json');
  pkg.overrides.download = 'github:garg3133/download#14.0.0';
  let r = run({ pkg });
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes('package.json overrides.download: '), r.out);

  pkg = readJson('package.json');
  pkg.overrides.nightwatch.download = 'git+ssh://git@github.com/garg3133/download.git';
  r = run({ pkg });
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes('package.json overrides.nightwatch.download: '), r.out);
});

test('plain registry ranges, tags and npm: aliases are accepted -> exit 0', () => {
  const lock = readJson('package-lock.json');
  lock.packages['node_modules/some-pkg'] = registry({
    dependencies: { a: '^1.2.3', b: '>=1 <2 || 3.x', c: 'latest', d: '*', e: 'npm:@scope/real@^2.0.0', f: 'npm:real@1.0.0' },
  });
  const r = run({ lock });
  assert.equal(r.status, 0, r.out);
});

test('every problem is reported, not just the first', () => {
  const lock = readJson('package-lock.json');
  lock.packages['node_modules/x1'] = registry({ resolved: GIT_SSH });
  lock.packages['node_modules/x2'] = registry({ integrity: undefined });
  const r = run({ lock });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /2 dependency source problem/);
  assert.ok(r.out.includes('node_modules/x1: '), r.out);
  assert.ok(r.out.includes('node_modules/x2: '), r.out);
});

// Fail CLOSED: a lockfile this script cannot read must never read as "clean".
test('no package-lock.json -> exit 2, not 0', () => {
  const r = run({ lockText: null });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /cannot read \.\/package-lock\.json/);
});

test('unparseable package-lock.json -> exit 2', () => {
  const r = run({ lockText: '{ not json' });
  assert.equal(r.status, 2, r.out);
});

test('no package.json -> exit 2', () => {
  const r = run({ pkgText: null });
  assert.equal(r.status, 2, r.out);
});

test('a lockfile with no `packages` map (lockfileVersion 1) -> exit 1, not 0', () => {
  const r = run({ lock: { name: 'x', lockfileVersion: 1, dependencies: { download: { version: GIT_SSH } } } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no `packages` map/);
});

// The Dockerfile is the shipped build. These pin the four things the fix changed
// there, so a later edit that quietly restores one fails here.
const DOCKERFILE = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
const dockerInstructions = DOCKERFILE.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n').replace(/\\\n/g, ' ');

test('Dockerfile: the build stage base image is pinned by sha256 digest', () => {
  const from = dockerInstructions.split('\n').find((l) => /^FROM\s+\S+\s+AS\s+build\b/i.test(l));
  assert.ok(from, 'precondition: a build stage exists');
  assert.match(from, /^FROM\s+node:[\w.-]+@sha256:[0-9a-f]{64}\s+AS\s+build\b/i);
});

test('Dockerfile: no global npm install of a CLI (unpinned, unlocked)', () => {
  assert.doesNotMatch(dockerInstructions, /\bnpm\s+(install|i|add)\s+(-g|--global)\b/);
  assert.doesNotMatch(dockerInstructions, /\bnpm\s+(install|i|add)\b.*\s(-g|--global)\b/);
});

test('Dockerfile: dependencies install with `npm ci --ignore-scripts`, never bare install', () => {
  assert.match(dockerInstructions, /\bnpm ci --ignore-scripts\b/);
  assert.doesNotMatch(dockerInstructions, /\bnpm ci\b(?! --ignore-scripts)/);
  assert.doesNotMatch(dockerInstructions, /\bnpm (install|i)\b/);
});

test('Dockerfile: the lockfile source check runs BEFORE npm ci, and its script is copied first', () => {
  const copy = dockerInstructions.indexOf('COPY scripts/check-lockfile-sources.mjs');
  const check = dockerInstructions.indexOf('node scripts/check-lockfile-sources.mjs');
  const ci = dockerInstructions.indexOf('npm ci');
  assert.ok(copy >= 0 && check >= 0 && ci >= 0, 'all three present');
  assert.ok(copy < check && check < ci, `order: copy ${copy} < check ${check} < npm ci ${ci}`);
});
