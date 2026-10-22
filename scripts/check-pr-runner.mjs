#!/usr/bin/env node
/**
 * check-pr-runner.mjs
 *
 * No workflow that runs on pull requests may send a job to a self-hosted runner.
 *
 * WHY. This repo is public. A pull request can come from anyone, and a job it
 * starts runs that person's code. The self-hosted runner this org uses lives on
 * the operator's own machine. PR #107 (2026-10-22) switched the coverage job,
 * which runs on pull_request, to `runs-on: ${{ fromJSON(vars.RUNS_ON || ...) }}`
 * while the repo variable RUNS_ON named the self-hosted labels. This check fails
 * on that line, so the same switch cannot come back unnoticed.
 *
 * WHAT IT ACCEPTS, for every job in a workflow triggered by pull_request or
 * pull_request_target:
 *   - a GitHub-hosted label: ubuntu-*, windows-*, macos-*
 *   - exactly the release.yml-style gate, which only a push can steer:
 *       ${{ fromJSON(github.event_name == 'push' && vars.NAME || '"ubuntu-latest"') }}
 * Anything else (self-hosted, a list form, any other expression) fails.
 * Workflows without a pull request trigger are not checked.
 *
 * WHAT IT DOES NOT DO. It is not the security boundary against a fork's pull
 * request: such a PR runs the FORK's copy of the workflow file, so it can
 * rewrite runs-on and delete this step. The org runner group setting
 * (allows_public_repositories=false) is the boundary. This check only stops a
 * change made inside the org from re-opening the door.
 *
 * Node built-ins only. Reads .github/workflows (or the directory given as the
 * first argument). Run locally with:  node scripts/check-pr-runner.mjs
 * Its RED tests:                      node --test scripts/check-pr-runner.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || path.join('.github', 'workflows');
const HOSTED = /^(ubuntu|windows|macos)-[A-Za-z0-9.]+$/;
const GATED = /^\$\{\{fromJSON\(github\.event_name=='push'&&vars\.[A-Za-z_][A-Za-z0-9_]*\|\|'"ubuntu-latest"'\)\}\}$/;

function stripComment(line) {
  // A "#" at the start or after whitespace, outside quotes, starts a comment
  // (this covers full-line comments too).
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

const unquote = (v) => v.trim().replace(/^(['"])(.*)\1$/, '$2');

/** True when the workflow's top-level `on:` names pull_request or pull_request_target. */
function prTriggered(lines) {
  const PR = /\bpull_request(_target)?\b/;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:on|"on"|'on'|true)\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[1].trim()) return PR.test(m[1]);
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim()) continue;
      if (!/^\s/.test(l)) break; // next top-level key
      if (PR.test(l)) return true;
    }
    return false;
  }
  return false;
}

/** Returns a list of problems in one workflow file's text. */
function checkWorkflow(text, name = 'workflow') {
  const lines = text.split(/\r?\n/).map(stripComment);
  if (!prTriggered(lines)) return [];
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)runs-on\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const where = `${name}:${i + 1}`;
    let value = m[2].trim();
    if (!value) {
      // Block form: a list or a group/labels map. Never accepted.
      problems.push(`${where}: runs-on in block form; a pull_request workflow must name a hosted label or use the push-only gate`);
      continue;
    }
    if (value.startsWith('[')) {
      problems.push(`${where}: runs-on is a label list (${value}); a pull_request workflow must name a hosted label or use the push-only gate`);
      continue;
    }
    value = unquote(value);
    if (HOSTED.test(value)) continue;
    if (GATED.test(value.replace(/\s+/g, ''))) continue;
    problems.push(`${where}: runs-on '${value}' can reach a self-hosted runner from a pull request`);
  }
  return problems;
}

function main() {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  } catch (e) {
    console.error(`check-pr-runner: cannot read ${dir}: ${e.message}`);
    process.exit(2);
  }
  if (files.length === 0) {
    console.error(`check-pr-runner: no workflow files in ${dir}`);
    process.exit(2);
  }
  const problems = files.flatMap((f) => checkWorkflow(fs.readFileSync(path.join(dir, f), 'utf8'), f));
  if (problems.length) {
    for (const p of problems) console.error(`FAIL ${p}`);
    console.error('Pull request jobs must run on GitHub-hosted runners. Use runs-on: ubuntu-latest, or');
    console.error(`  runs-on: \${{ fromJSON(github.event_name == 'push' && vars.RUNS_ON || '"ubuntu-latest"') }}`);
    process.exit(1);
  }
  console.log(`check-pr-runner: PASS (${files.length} workflow file(s); no pull request job can reach a self-hosted runner)`);
}

main();
