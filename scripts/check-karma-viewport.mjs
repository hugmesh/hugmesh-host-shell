#!/usr/bin/env node
/**
 * check-karma-viewport.mjs
 *
 * Every browser karma launches by DEFAULT must render at a viewport wide enough
 * for the desktop layout specs — bootstrap's `lg` breakpoint, 992px.
 *
 * WHY THIS EXISTS. On 2026-08-20, commit 544d9eb added
 * `--window-size=1600,1200` to the ChromeHeadlessCI launcher with a nine-line
 * comment explaining that the window size IS the viewport every media query is
 * evaluated against. It added that flag to ONE launcher. `browsers` listed
 * three. So `npm test` — the command written in this repo's own package.json —
 * ran the suite three times, twice at Chrome's default 800x600 (~765px inside
 * karma's iframe), and went red on 7 desktop-layout specs on a perfectly
 * healthy tree, every single time, for three weeks.
 *
 * CI never saw it: `npm run coverage` passes `--browsers=ChromeHeadlessCI` and
 * bypasses the list entirely. Green where it is measured, red where people
 * look. A suite like that teaches its own team to ignore it, which costs more
 * than the bug it was hiding.
 *
 * This reads the REAL karma.conf.js through karma's own callback, not the file
 * as text, so a commented-out flag or a renamed launcher cannot satisfy it.
 * Plugin `require`s are stubbed so it runs with or without node_modules.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MIN_WIDTH = 992; // bootstrap lg

const require = createRequire(import.meta.url);
const Module = require("node:module");

// Stub the karma plugin requires: this guard is about configuration, and
// should not need a populated node_modules to answer.
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.startsWith("karma-") || request.startsWith("@angular-devkit/")) {
    return {};
  }
  try {
    return realLoad(request, parent, isMain);
  } catch (err) {
    if (err && err.code === "MODULE_NOT_FOUND") return {};
    throw err;
  }
};

let cfg = null;
require(join(ROOT, "karma.conf.js"))({ set: (o) => (cfg = o) });
Module._load = realLoad;

if (!cfg) {
  console.error("check-karma-viewport: karma.conf.js never called config.set()");
  process.exit(2);
}

const browsers = cfg.browsers || [];
const launchers = cfg.customLaunchers || {};
const problems = [];

if (browsers.length === 0) {
  problems.push("karma.conf.js lists no default browsers at all");
}

/** Width from a --window-size=W,H flag, or null when the launcher has none. */
function widthOf(flags) {
  for (const f of flags || []) {
    const m = /^--window-size=(\d+),(\d+)$/.exec(String(f));
    if (m) return Number(m[1]);
  }
  return null;
}

for (const name of browsers) {
  const launcher = launchers[name];
  if (!launcher) {
    problems.push(
      `browser "${name}" is launched by default but is not defined in customLaunchers — ` +
        `it therefore runs at Chrome's 800x600 default, below the ${MIN_WIDTH}px desktop breakpoint`,
    );
    continue;
  }
  const width = widthOf(launcher.flags);
  if (width === null) {
    problems.push(
      `launcher "${name}" has no --window-size flag, so it renders at ~765px and every ` +
        `desktop-layout spec fails on a healthy tree`,
    );
  } else if (width < MIN_WIDTH) {
    problems.push(
      `launcher "${name}" renders at ${width}px, below the ${MIN_WIDTH}px bootstrap lg breakpoint`,
    );
  }
}

// Every launcher, not only the default ones: a launcher someone selects with
// --browsers=X on the command line has to be right too.
for (const [name, launcher] of Object.entries(launchers)) {
  if (browsers.includes(name)) continue;
  const width = widthOf(launcher.flags);
  if (width === null || width < MIN_WIDTH) {
    problems.push(
      `launcher "${name}" is selectable with --browsers=${name} but renders at ` +
        `${width === null ? "Chrome's default ~765px" : width + "px"}`,
    );
  }
}

if (problems.length) {
  console.error("check-karma-viewport: FAIL");
  for (const p of problems) console.error("  - " + p);
  console.error(
    `\n  Fix: give every launcher a --window-size with width >= ${MIN_WIDTH}, and only list\n` +
      "  launchers in `browsers` that have one. See the comment at the top of this file.",
  );
  process.exit(1);
}

console.log(
  `check-karma-viewport: ok — ${browsers.length} default browser(s), ` +
    `${Object.keys(launchers).length} launcher(s), all >= ${MIN_WIDTH}px`,
);
