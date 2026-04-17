#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const JUNIT_DIR    = 'coverage/snapdragon';
const JUNIT_FILE   = 'test-results.xml';
const COVERAGE_PATH = 'coverage/snapdragon/coverage-summary.json';
const PR_COMMENT   = 'coverage/snapdragon/pr-comment.md';
const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY;
const RUN_URL      = process.env.RUN_URL || '';

// ---------- helpers ----------

function findJUnit() {
  const exact = path.join(JUNIT_DIR, JUNIT_FILE);
  if (fs.existsSync(exact)) return exact;
  if (!fs.existsSync(JUNIT_DIR)) return null;
  return walk(JUNIT_DIR, JUNIT_FILE);
}

function walk(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = walk(full, name); if (hit) return hit; }
    else if (e.name === name) return full;
  }
  return null;
}

function parseJUnit(xml) {
  let tests = 0, failures = 0, errors = 0, skipped = 0;
  for (const m of xml.matchAll(/<testsuite\b([^>]*)>/g)) {
    const a = m[1];
    tests    += parseInt(a.match(/\btests="(\d+)"/)?.[1]    || '0', 10);
    failures += parseInt(a.match(/\bfailures="(\d+)"/)?.[1] || '0', 10);
    errors   += parseInt(a.match(/\berrors="(\d+)"/)?.[1]   || '0', 10);
    skipped  += parseInt(a.match(/\bskipped="(\d+)"/)?.[1]  || '0', 10);
  }
  const failedTests = [];
  for (const m of xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
    const body = m[2];
    if (!body.includes('<failure') && !body.includes('<error')) continue;
    const attrs    = m[1];
    const name     = attrs.match(/\bname="([^"]*)"/)?.[1]      || '(unknown)';
    const classname= attrs.match(/\bclassname="([^"]*)"/)?.[1] || '';
    const msgMatch = body.match(/<(?:failure|error)[^>]*message="([^"]*)"/);
    const txtMatch = body.match(/<(?:failure|error)[^>]*>([\s\S]*?)<\/(?:failure|error)>/);
    failedTests.push({ name, classname, message: msgMatch?.[1] || txtMatch?.[1]?.trim() || '' });
  }
  return { tests, failures, errors, skipped, failedTests };
}

function pctIcon(p) { return p >= 80 ? '🟢' : p >= 60 ? '🟡' : '🔴'; }
function fmtPct(n)  { return Number(n).toFixed(1) + '%'; }

// ---------- main ----------

const junitPath = findJUnit();
if (!junitPath) { console.log('No JUnit report found.'); process.exit(0); }

const xml = fs.readFileSync(junitPath, 'utf8');
const { tests, failures, errors, skipped, failedTests } = parseJUnit(xml);
const totalFailed = failures + errors;
const passed      = tests - totalFailed - skipped;
const allPassed   = totalFailed === 0;

let coverage = null;
if (fs.existsSync(COVERAGE_PATH)) {
  try { coverage = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8')).total; } catch {}
}

const out = [];

const icon  = allPassed ? '✅' : '❌';
const title = allPassed
  ? `All ${tests} unit tests passed`
  : `${totalFailed} of ${tests} unit tests failed`;

out.push(`## ${icon} Unit Tests — ${title}\n`);
out.push(`> **${passed}** passed &nbsp;·&nbsp; **${totalFailed}** failed &nbsp;·&nbsp; **${skipped}** skipped\n`);

if (coverage) {
  out.push('### Coverage\n');
  out.push('| Metric | | % | Covered / Total |');
  out.push('|--------|--|---|-----------------|');
  for (const [label, key] of [['Statements','statements'],['Branches','branches'],['Functions','functions'],['Lines','lines']]) {
    const m = coverage[key];
    if (!m) continue;
    out.push(`| ${label} | ${pctIcon(m.pct)} | **${fmtPct(m.pct)}** | ${m.covered} / ${m.total} |`);
  }
  out.push('');
}

if (failedTests.length > 0) {
  out.push('<details open><summary>❌ Failed tests</summary>\n');
  out.push('| Test | Error |');
  out.push('|------|-------|');
  for (const t of failedTests) {
    const label = t.classname || t.name;
    const msg   = (t.message || '').replace(/\r?\n/g,' ').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').slice(0,200);
    out.push(`| \`${label}\` | ${msg || '—'} |`);
  }
  out.push('\n</details>\n');
}

out.push('---\n');
if (RUN_URL) out.push(`[View workflow run ↗](${RUN_URL})`);

const markdown = out.join('\n');

if (SUMMARY_FILE) { fs.appendFileSync(SUMMARY_FILE, markdown + '\n'); console.log('Summary written.'); }
else { console.log(markdown); }

fs.mkdirSync(path.dirname(PR_COMMENT), { recursive: true });
fs.writeFileSync(PR_COMMENT, markdown + '\n');
console.log('PR comment written to', PR_COMMENT);
