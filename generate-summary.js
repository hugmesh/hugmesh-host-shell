#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const REPORT_PATH   = 'integration-tests-report/cucumber-report.json';
const SUMMARY_FILE  = process.env.GITHUB_STEP_SUMMARY;
const PR_COMMENT    = 'integration-tests-report/pr-comment.md';
const ARTIFACT_URL  = process.env.ARTIFACT_URL || '';
const RUN_URL       = process.env.RUN_URL      || '';

function ns2s(ns) { return (ns && ns > 0) ? (ns / 1e9).toFixed(2) + 's' : ''; }
function trunc(s, max = 180) { if (!s) return ''; const f = s.replace(/\r?\n|\r/g,' ').trim(); return f.length > max ? f.slice(0,max)+'…' : f; }
function esc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/`/g,"'"); }

if (!fs.existsSync(REPORT_PATH)) { console.log('No cucumber report found at', REPORT_PATH); process.exit(0); }

let features;
try { features = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')); }
catch (e) { console.error('Failed to parse cucumber report:', e.message); process.exit(1); }

let totalPassed = 0, totalFailed = 0, totalSkipped = 0;
for (const f of features) {
  for (const sc of f.elements) {
    const failed  = sc.steps.some(s => s.result?.status === 'failed');
    const skipped = !failed && sc.steps.some(s => s.result?.status === 'skipped');
    if (failed) totalFailed++; else if (skipped) totalSkipped++; else totalPassed++;
  }
}

const total     = totalPassed + totalFailed + totalSkipped;
const allPassed = totalFailed === 0;
const icon      = allPassed ? '✅' : '❌';
const title     = allPassed ? `All ${total} scenarios passed` : `${totalFailed} of ${total} scenarios failed`;

const out = [];
out.push(`## ${icon} Integration Tests — ${title}\n`);
out.push(`> **${totalPassed}** passed &nbsp;·&nbsp; **${totalFailed}** failed &nbsp;·&nbsp; **${totalSkipped}** skipped &nbsp;·&nbsp; **${features.length}** feature${features.length===1?'':'s'}\n`);
out.push('');

for (const feature of features) {
  const fFailed  = feature.elements.some(sc => sc.steps.some(s => s.result?.status === 'failed'));
  const fIcon    = fFailed ? '❌' : '✅';
  const fPassed  = feature.elements.filter(sc => !sc.steps.some(s => s.result?.status === 'failed')).length;
  const fFail    = feature.elements.length - fPassed;
  const subtitle = fFailed ? ` — ${fFail} failed` : ` — ${fPassed} passed`;
  const openAttr = fFailed ? ' open' : '';

  out.push(`<details${openAttr}><summary>${fIcon} <strong>${esc(feature.name)}</strong>${subtitle} (${feature.elements.length} scenario${feature.elements.length===1?'':'s'})</summary>\n`);
  out.push('');
  out.push('| Scenario | Status | Duration |');
  out.push('|----------|--------|----------|');

  for (const sc of feature.elements) {
    const failStep = sc.steps.find(s => s.result?.status === 'failed');
    const skip     = !failStep && sc.steps.some(s => s.result?.status === 'skipped');
    let status;
    if (failStep) {
      const err = trunc(failStep.result.error_message);
      status = err ? `❌ Failed<br><sub><code>${esc(err)}</code></sub>` : '❌ Failed';
    } else if (skip) {
      status = '⏭️ Skipped';
    } else {
      status = '✅ Passed';
    }
    const dur = ns2s(sc.steps.reduce((a,s) => a+(s.result?.duration||0),0)) || '—';
    out.push(`| ${esc(sc.name)} | ${status} | ${dur} |`);
  }

  out.push('');
  out.push('</details>\n');
}

out.push('---\n');
if (ARTIFACT_URL) out.push(`📥 [Download HTML report with screenshots](${ARTIFACT_URL})`);
else out.push('📥 Download the `integration-test-report` artifact for the full HTML report with screenshots.');
if (RUN_URL) out.push(`\n[View workflow run ↗](${RUN_URL})`);

const markdown = out.join('\n');

if (SUMMARY_FILE) { fs.appendFileSync(SUMMARY_FILE, markdown + '\n'); console.log('Summary written.'); }
else { console.log(markdown); }

fs.mkdirSync(path.dirname(PR_COMMENT), { recursive: true });
fs.writeFileSync(PR_COMMENT, markdown + '\n');
console.log('PR comment written to', PR_COMMENT);
