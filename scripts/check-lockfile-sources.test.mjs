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

function run({ lock = readJson('package-lock.json'), pkg = readJson('package.json'), lockText, pkgText, extra = {}, env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-sources-'));
  try {
    for (const [f, text] of Object.entries(extra)) fs.writeFileSync(path.join(dir, f), text);
    if (lockText !== null) fs.writeFileSync(path.join(dir, 'package-lock.json'), lockText ?? JSON.stringify(lock));
    if (pkgText !== null) fs.writeFileSync(path.join(dir, 'package.json'), pkgText ?? JSON.stringify(pkg));
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
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
// A clean registry entry for package `name`: its resolved URL is that package's
// own tarball, so a test that adds it under node_modules/<name> fails ONLY for
// the one thing that test mutates.
const tarball = (name, version) => `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;
const registry = (extra = {}, name = 'download') => ({
  version: '14.0.0',
  resolved: tarball(name, '14.0.0'),
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

// Round 2: `inBundle` / `link` used to exempt an entry from the resolved and
// integrity checks. npm still installs such an entry from its `resolved` source
// (measured with a git+file package: npm 11.16.0 `npm ci --ignore-scripts`
// installed it; npm 12.2.0 `npm ci --allow-git=all` also ran its prepare and
// postinstall), so one added key carried the original exploit through.
test('the round-2 exploit: git resolved, no integrity, "inBundle": true -> exit 1, names it', () => {
  const r = withEntry({ version: '14.0.0', resolved: GIT_SSH, inBundle: true, dev: true });
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes(`${KEY}: has a \`inBundle\` key`), r.out);
  assert.ok(r.out.includes(`${KEY}: resolved uses git+ssh:`), r.out);
});

for (const [name, entry] of [
  ['git+file resolved, inBundle', { version: '1.0.0', resolved: 'git+file:///tmp/evil-src#a58658fbae679bf632c4acc1c44eb1ff614d84cc', inBundle: true }],
  ['git+ssh resolved, link: true', { version: '14.0.0', resolved: GIT_SSH, link: true }],
  ['link to a path', { resolved: 'packages/some-link', link: true }],
  ['bundled with no resolved', { version: '1.0.0', inBundle: true }],
  ['inBundle as a truthy string', { version: '1.0.0', resolved: GIT_SSH, inBundle: 'yes' }],
  ['link as a truthy number', { version: '1.0.0', resolved: GIT_SSH, link: 1 }],
  ['registry + integrity but inBundle', registry({ inBundle: true })],
  ['registry + integrity but link: false', registry({ link: false })],
]) {
  test(`an entry carrying link/inBundle (${name}) -> exit 1, never exempt`, () => {
    const r = withEntry(entry);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, new RegExp(`${KEY}: has a \`(link|inBundle)\` key`));
  });
}

test('the same link/inBundle rejection applies under a nested node_modules path', () => {
  const r = withEntry({ version: '1.0.0', resolved: GIT_SSH, inBundle: true }, 'node_modules/a/node_modules/bundled');
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes('node_modules/a/node_modules/bundled: has a `inBundle` key'), r.out);
});

for (const [name, entry] of [
  ['null', null],
  ['a string', GIT_SSH],
  ['an array', [GIT_SSH]],
  ['a number', 1],
  ['true', true],
]) {
  test(`a packages entry that is ${name} -> exit 1`, () => {
    const r = withEntry(entry);
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`${KEY}: entry is not a JSON object`), r.out);
  });
}

// Round 2: npm 11 prefers npm-shrinkwrap.json over package-lock.json, and the
// e2e:host job mounts the whole checkout. A clean package-lock.json next to a
// shrinkwrap carrying the git entry used to pass this check (measured: npm
// 11.16.0 `npm ci` then installed the git package and ran its prepare).
const shrinkwrapWithGit = () => {
  const sw = readJson('package-lock.json');
  sw.packages[KEY] = { version: '14.0.0', resolved: GIT_SSH, dev: true };
  return JSON.stringify(sw);
};
test('the round-2 shrinkwrap exploit: clean package-lock.json + npm-shrinkwrap.json with git -> exit 1', () => {
  const r = run({ extra: { 'npm-shrinkwrap.json': shrinkwrapWithGit() } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\.\/npm-shrinkwrap\.json exists/);
});

for (const [name, file, text] of [
  ['an exact copy of the clean lockfile', 'npm-shrinkwrap.json', null],
  ['empty', 'npm-shrinkwrap.json', ''],
  ['upper-case name', 'NPM-SHRINKWRAP.JSON', null],
  ['mixed-case name', 'Npm-Shrinkwrap.json', null],
]) {
  test(`any npm-shrinkwrap.json (${name}) -> exit 1`, () => {
    const body = text ?? fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
    const r = run({ extra: { [file]: body } });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`./${file} exists`), r.out);
  });
}

test('the committed tree has no npm-shrinkwrap.json and no link/inBundle entries', () => {
  assert.ok(!fs.readdirSync(ROOT).some((f) => f.toLowerCase() === 'npm-shrinkwrap.json'));
  const lock = readJson('package-lock.json');
  for (const [k, e] of Object.entries(lock.packages)) {
    assert.ok(!Object.hasOwn(e, 'link') && !Object.hasOwn(e, 'inBundle'), k);
  }
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
    lock.packages['node_modules/some-pkg'] = registry({ dependencies: { download: spec } }, 'some-pkg');
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
    dependencies: { a: '^1.2.3', b: '>=1 <2 || 3.x', c: 'latest', d: '*', e: 'npm:@scope/real@^2.0.0', f: 'npm:real@1.0.0', g: '~1.2.3', h: '1.2.3 - 2.x', i: '' },
  }, 'some-pkg');
  const r = run({ lock });
  assert.equal(r.status, 0, r.out);
});

test('every problem is reported, not just the first', () => {
  const lock = readJson('package-lock.json');
  lock.packages['node_modules/x1'] = registry({ resolved: GIT_SSH }, 'x1');
  lock.packages['node_modules/x2'] = registry({ integrity: undefined }, 'x2');
  const r = run({ lock });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /2 dependency source problem/);
  assert.ok(r.out.includes('node_modules/x1: '), r.out);
  assert.ok(r.out.includes('node_modules/x2: has no integrity hash'), r.out);
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

// ---- Round 3: the project .npmrc can send every registry URL somewhere else ----
//
// Measured with npm 12.2.0: a lockfile entry resolved to
// https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz, integrity = the sha512
// of an attacker tarball, and `.npmrc` = `registry=http://127.0.0.1:<port>/`.
// The round-2 gate printed OK and exited 0; `npm ci` fetched
// /isarray/-/isarray-2.0.5.tgz from 127.0.0.1 and installed it.
const COMMITTED_NPMRC = fs.readFileSync(path.join(ROOT, '.npmrc'), 'utf8');
const withNpmrc = (text) => run({ extra: { '.npmrc': text } });

test('round-3 exploit: `.npmrc` registry=http://127.0.0.1:48117/ with a clean lockfile -> exit 1, names it', () => {
  const r = withNpmrc('registry=http://127.0.0.1:48117/\n');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\.\/\.npmrc line 1: "registry=http:\/\/127\.0\.0\.1:48117\/" is not allowed/);
});

test('the committed .npmrc passes -> exit 0', () => {
  const r = withNpmrc(COMMITTED_NPMRC);
  assert.equal(r.status, 0, r.out);
});

test('the committed .npmrc holds only legacy-peer-deps=true (plus comments/blank lines)', () => {
  const live = COMMITTED_NPMRC.split(/[\r\n]/).filter((l) => l.trim() !== '' && !/^\s*[#;]/.test(l));
  assert.deepEqual(live, ['legacy-peer-deps=true']);
});

test('no .npmrc at all -> exit 0', () => {
  assert.equal(run().status, 0);
});

test('comments, blank lines, CRLF and spaces around = are accepted -> exit 0', () => {
  const r = withNpmrc('# project npm config\r\n; another comment\r\n\r\n  legacy-peer-deps = true  \r\n');
  assert.equal(r.status, 0, r.out);
});

for (const [name, text] of [
  ['registry with spaces and quotes', 'legacy-peer-deps=true\nregistry = "http://127.0.0.1:48117/"\n'],
  ['registry pointing at the real registry over http', 'registry=http://registry.npmjs.org/\n'],
  ['registry in upper case', 'REGISTRY=http://127.0.0.1:48117/\n'],
  ['scoped registry', '@angular:registry=http://127.0.0.1:48117/\n'],
  ['replace-registry-host', 'replace-registry-host=always\n'],
  ['https-proxy', 'https-proxy=http://127.0.0.1:48117/\n'],
  ['proxy', 'proxy=http://127.0.0.1:48117/\n'],
  ['strict-ssl off', 'strict-ssl=false\n'],
  ['custom CA', 'ca="-----BEGIN CERTIFICATE-----"\n'],
  ['cafile', 'cafile=./evil-ca.pem\n'],
  ['cache in the checkout', 'cache=./.npm-cache\n'],
  ['an ini section', '[registry]\n'],
  ['an unknown key', 'some-future-setting=1\n'],
  ['allowed key with an env interpolation', 'legacy-peer-deps=${X}\n'],
  ['allowed key with a different value', 'legacy-peer-deps=false\n'],
  ['allowed key, then a trailing setting', 'legacy-peer-deps=true registry=http://127.0.0.1:48117/\n'],
  ['bad line with no trailing newline', 'legacy-peer-deps=true\nregistry=http://127.0.0.1:48117/'],
  ['bare CR hides a line after a comment', '# note\rregistry=http://127.0.0.1:48117/\n'],
  ['bare CR after the allowed line', 'legacy-peer-deps=true\rregistry=http://127.0.0.1:48117/\n'],
]) {
  test(`.npmrc spelling refused: ${name} -> exit 1`, () => {
    const r = withNpmrc(text);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /\.\/\.npmrc line \d+: .* is not allowed/);
  });
}

test('a .npmrc that exists but cannot be read (a directory) -> exit 2, not 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-sources-'));
  try {
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(readJson('package-lock.json')));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(readJson('package.json')));
    fs.mkdirSync(path.join(dir, '.npmrc'));
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2, `${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /\.npmrc exists but cannot be read/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const [name, value] of [
  ['npm_config_registry', 'http://127.0.0.1:48117/'],
  ['NPM_CONFIG_REGISTRY', 'http://127.0.0.1:48117/'],
  ['npm_config_@angular:registry', 'http://127.0.0.1:48117/'],
  ['npm_config_replace_registry_host', 'always'],
  ['npm_config_https_proxy', 'http://127.0.0.1:48117/'],
  ['npm_config_proxy', 'http://127.0.0.1:48117/'],
  ['npm_config_strict_ssl', 'false'],
  ['npm_config_cafile', '/work/evil-ca.pem'],
  ['npm_config_ca', 'x'],
]) {
  test(`environment refused: ${name}=${value} -> exit 1`, () => {
    const r = run({ env: { [name]: value } });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /environment .* changes where npm fetches from/);
  });
}

test('environment at npm defaults (as `npm run` exports them) is accepted -> exit 0', () => {
  const r = run({ env: {
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_noproxy: '',
    npm_config_strict_ssl: 'true',
    npm_config_replace_registry_host: 'npmjs',
    npm_config_legacy_peer_deps: 'true',
    npm_config_cache: '/home/someone/.npm',
  } });
  assert.equal(r.status, 0, r.out);
});

test('.gitlab-ci.yml: e2e:host runs the check, then npm ci with an explicit --registry', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.gitlab-ci.yml'), 'utf8');
  const check = ci.indexOf('node scripts/check-lockfile-sources.mjs');
  const install = ci.search(/\bnpm ci\b[^;\n]*--registry=https:\/\/registry\.npmjs\.org\/[;\s]/);
  assert.ok(check >= 0 && install > check, `check ${check} then npm ci --registry ${install}`);
  for (const m of ci.matchAll(/^[^#\n]*\bnpm (ci|install|i)\b[^\n]*/gm)) {
    assert.match(m[0], /--registry=https:\/\/registry\.npmjs\.org\//, m[0]);
  }
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

test('Dockerfile: npm ci names the registry on the command line, over any .npmrc or env', () => {
  assert.match(dockerInstructions, /\bnpm ci --ignore-scripts --registry=https:\/\/registry\.npmjs\.org\/(\s|$)/);
  assert.doesNotMatch(dockerInstructions, /\bnpm ci\b(?![^\n]*--registry=https:\/\/registry\.npmjs\.org\/)/);
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

// ---- Round 4: a registry URL that is not the entry's OWN tarball ----
//
// Measured (npm 11.16.0 and 12.2.0): node_modules/isarray with `resolved` set to
// is-number's tarball and is-number's real integrity. The round-3 gate checked
// only the scheme, userinfo, port and host, printed OK and exited 0; `npm ci
// --ignore-scripts --registry=https://registry.npmjs.org/` then installed
// is-number's code as `isarray`. Anyone can publish to npm, so this is the
// original exploit (code the attacker chose, under a trusted name, with a hash
// the attacker wrote) moved onto the allowed host.
const IS_NUMBER_TGZ = 'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz';
const IS_NUMBER_SHA = 'sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==';

test('round-4 exploit on the REAL lockfile: isarray resolved to is-number\'s tarball (two-line edit) -> exit 1, names it', () => {
  const lock = readJson('package-lock.json');
  const e = lock.packages['node_modules/isarray'];
  assert.ok(e && e.version === '2.0.5', 'precondition: the committed lockfile locks isarray@2.0.5');
  e.resolved = IS_NUMBER_TGZ;
  e.integrity = IS_NUMBER_SHA;
  const r = run({ lock });
  assert.equal(r.status, 1, r.out);
  assert.ok(r.out.includes("node_modules/isarray: resolved is not isarray@2.0.5's own registry tarball"), r.out);
});

test('round-4 exploit, minimal project: { isarray: 2.0.5 } locked to is-number -> exit 1', () => {
  const pkg = { name: 'x', version: '1.0.0', dependencies: { isarray: '2.0.5' } };
  const lock = {
    name: 'x', version: '1.0.0', lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'x', version: '1.0.0', dependencies: { isarray: '2.0.5' } },
      'node_modules/isarray': { version: '2.0.5', resolved: IS_NUMBER_TGZ, integrity: IS_NUMBER_SHA },
    },
  };
  const r = run({ lock, pkg });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /node_modules\/isarray: resolved is not isarray@2\.0\.5's own registry tarball/);
  // ...and the same project with isarray's real tarball passes, so the rule is
  // about the substitution, not the shape of the fixture.
  lock.packages['node_modules/isarray'].resolved = 'https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz';
  assert.equal(run({ lock, pkg }).status, 0);
});

for (const [name, key, version, resolved] of [
  ['an unscoped entry pointing at a scoped tarball', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/@types/node/-/node-26.6.5.tgz'],
  ['a scoped entry pointing at an unscoped tarball', 'node_modules/@types/node', '26.6.5', IS_NUMBER_TGZ],
  ['a scoped entry pointing at another scope', 'node_modules/@types/node', '26.6.5', 'https://registry.npmjs.org/@evil/node/-/node-26.6.5.tgz'],
  ['a scoped entry with the scope dropped', 'node_modules/@types/node', '26.6.5', 'https://registry.npmjs.org/node/-/node-26.6.5.tgz'],
  ['right package, different version than the entry says', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/isarray/-/isarray-1.0.0.tgz'],
  ['right tarball name under another package path', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/evil/-/isarray-2.0.5.tgz'],
  ['query string on the right tarball', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz?x=1'],
  ['fragment on the right tarball', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz#x'],
  ['dot segments that normalise elsewhere', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/isarray/-/../../is-number/-/is-number-7.0.0.tgz'],
  ['dot segments that normalise to the right path', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/evil/../isarray/-/isarray-2.0.5.tgz'],
  ['percent-escaped name', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/isarr%61y/-/isarray-2.0.5.tgz'],
  ['encoded scope slash', 'node_modules/@types/node', '26.6.5', 'https://registry.npmjs.org/@types%2fnode/-/node-26.6.5.tgz'],
  ['backslashes', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/isarray\\-\\isarray-2.0.5.tgz'],
  ['packument instead of tarball', 'node_modules/isarray', '2.0.5', 'https://registry.npmjs.org/isarray'],
  ['a key that is not node_modules/<name>', 'lib/isarray', '2.0.5', 'https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz'],
  ['a key with a trailing slash', 'node_modules/isarray/', '2.0.5', 'https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz'],
  ['a key with a dot segment', 'node_modules/./isarray', '2.0.5', 'https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz'],
  ['an upper-case package name', 'node_modules/IsArray', '2.0.5', 'https://registry.npmjs.org/IsArray/-/IsArray-2.0.5.tgz'],
  ['a version that is a range, not a version', 'node_modules/isarray', '^2.0.5', 'https://registry.npmjs.org/isarray/-/isarray-^2.0.5.tgz'],
  // The text equals "<registry>/isarray/-/isarray-" + version + ".tgz" exactly,
  // and a URL parser normalises it to is-number's tarball.
  ['a version carrying a path', 'node_modules/isarray', '2.0.5/../../../is-number/-/is-number-7.0.0', 'https://registry.npmjs.org/isarray/-/isarray-2.0.5/../../../is-number/-/is-number-7.0.0.tgz'],
  ['no version at all', 'node_modules/isarray', undefined, 'https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz'],
  ['a dist-tag as the version, with a URL built from it', 'node_modules/isarray', 'latest', 'https://registry.npmjs.org/isarray/-/isarray-latest.tgz'],
]) {
  test(`round 4, resolved not the entry's own tarball: ${name} -> exit 1`, () => {
    const lock = readJson('package-lock.json');
    delete lock.packages['node_modules/isarray'];
    lock.packages[key] = { version, resolved, integrity: SHA512, dev: true };
    const r = run({ lock });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`${key}: `), r.out);
  });
}

for (const [name, key, version] of [
  ['an unscoped package', 'node_modules/isarray', '2.0.5'],
  ['a scoped package', 'node_modules/@types/node', '26.6.5'],
  ['a nested scoped package', 'node_modules/@angular/cli/node_modules/@angular-devkit/core', '22.2.3'],
  ['a prerelease version', 'node_modules/isarray', '3.0.0-rc.1'],
]) {
  test(`round 4, the entry's own tarball is accepted: ${name} -> exit 0`, () => {
    const lock = readJson('package-lock.json');
    lock.packages[key] = { version, resolved: tarball(key.split('node_modules/').pop(), version), integrity: SHA512, dev: true };
    const r = run({ lock });
    assert.equal(r.status, 0, r.out);
  });
}

test('every committed lock entry resolves to its own name@version tarball', () => {
  const lock = readJson('package-lock.json');
  for (const [k, e] of Object.entries(lock.packages)) {
    if (k === '') continue;
    assert.equal(e.resolved, tarball(k.split('node_modules/').pop(), e.version), k);
  }
});

// npm 12 lockfileVersion 4 `patched` (measured: package.json patchedDependencies
// + a `patched: {integrity, path}` lock key; `npm ci --ignore-scripts` exited 0
// and require('isarray')([]) returned the repo's patched code). The round-3 gate
// accepted the unknown key. Every key outside the plain-registry set is refused.
for (const [name, extra] of [
  ['npm 12 `patched`', { patched: { integrity: SHA512, path: 'patches/isarray.patch' } }],
  ['an alias `name`', { name: 'is-number' }],
  ['`hasShrinkwrap`', { hasShrinkwrap: true }],
  ['`bundleDependencies`', { bundleDependencies: ['x'] }],
  ['`extraneous`', { extraneous: true }],
  ['a key npm has not invented yet', { overlay: 'patches/x' }],
]) {
  test(`an entry carrying ${name} -> exit 1`, () => {
    const lock = readJson('package-lock.json');
    Object.assign(lock.packages['node_modules/isarray'], extra);
    const r = run({ lock });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /node_modules\/isarray: has key\(s\) `[^`]+` that a plain registry entry does not carry/);
  });
}

for (const v of [4, 1, '3', undefined]) {
  test(`lockfileVersion ${JSON.stringify(v)} -> exit 1`, () => {
    const lock = readJson('package-lock.json');
    lock.lockfileVersion = v;
    const r = run({ lock });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /lockfileVersion .* is not 2 or 3/);
  });
}

for (const [field, value] of [
  ['patchedDependencies', { 'isarray@2.0.5': 'patches/isarray.patch' }],
  ['packageExtensions', { isarray: { dependencies: { evil: '1.0.0' } } }],
  ['workspaces', ['packages/*']],
]) {
  test(`package.json \`${field}\` -> exit 1`, () => {
    const pkg = readJson('package.json');
    pkg[field] = value;
    const r = run({ pkg });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`package.json has \`${field}\``), r.out);
  });
}

// npm-package-arg reads all of these as a file or directory with no slash
// (measured: `.evil-dir` directory, `..evil.tgz` file, `..` and `.` directory;
// the round-3 gate passed {evil: ".evil-dir"} and overrides {isarray: "..evil.tgz"}).
for (const [name, spec] of [
  ['.', '.'],
  ['..', '..'],
  ['.evil-dir', '.evil-dir'],
  ['..evil.tgz', '..evil.tgz'],
  ['evil.tgz', 'evil.tgz'],
  ['evil.tar.gz', 'evil.tar.gz'],
  ['evil.tar', 'evil.tar'],
  ['upper-case EVIL.TGZ', 'EVIL.TGZ'],
  ['~/home path', '~/evil'],
  ['leading backslash', '\\evil'],
  ['backslash inside', 'evil\\x'],
  ['npm alias to a tarball file', 'npm:download@evil.tgz'],
]) {
  test(`a dependency spec read as a path (${name}) -> exit 1, in package.json, overrides and the lockfile`, () => {
    let pkg = readJson('package.json');
    pkg.devDependencies.evil = spec;
    let r = run({ pkg });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes('package.json devDependencies.evil: '), r.out);

    pkg = readJson('package.json');
    pkg.overrides.isarray = spec;
    r = run({ pkg });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes('package.json overrides.isarray: '), r.out);

    const lock = readJson('package-lock.json');
    lock.packages['node_modules/isarray'].dependencies = { evil: spec };
    r = run({ lock });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes('node_modules/isarray dependencies.evil: '), r.out);
  });
}
