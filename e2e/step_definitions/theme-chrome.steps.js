'use strict';

/**
 * Step definitions for the theme-driven CHROME contract (issue #19): the
 * moving background's gradient wash and the header/footer density axis, both
 * read live off `--sd-*`/`--hug-*` custom properties on `documentElement`
 * (background/theme-tokens.ts, chrome/chrome-tokens.ts).
 *
 * This repo has no in-page theme maker — the theme normally arrives as
 * injected CSS text (docker-entrypoint.d/50-snap-theme.sh). These steps
 * simulate that delivery the same way background/theme-tokens.ts's own doc
 * comment says any mechanism that changes those properties does: setting
 * them directly on `documentElement.style`, then dispatching the same
 * `hug-theme-change` event a future in-page switcher would (background
 * component's watchTheme() also reacts to a plain style-attribute mutation
 * via its own MutationObserver, so the event is belt-and-braces, not the
 * only trigger).
 */

const { Then, When } = require('@cucumber/cucumber');
const assert = require('assert');

/** WHEN the active theme declares "<token>" as "<value>" — simulate an
 *  injected theme stylesheet (or a future in-page switcher) setting one
 *  custom property on :root, the same way 50-snap-theme.sh's generated
 *  `:root:root { ... }` block would. */
When('the active theme declares {string} as {string}', async function (token, value) {
  await browser.execute(
    (t, v) => {
      document.documentElement.style.setProperty(t, v);
      window.dispatchEvent(new Event('hug-theme-change'));
    },
    [token, value],
  );
});

/** THEN the background element's rendered gradient contains "<fragment>" —
 *  reads the LIVE computed style of <app-background> (the :host the CSS wash
 *  paints onto), not any cached/JS-side copy, so this proves the CSS engine
 *  actually re-resolved the custom property. Polls briefly: the component's
 *  MutationObserver-driven re-read (for anything that also drives the WebGL
 *  palette signal) runs on a rAF-debounced refresh, and this assertion
 *  should hold true even before that fires (the CSS cascade itself is
 *  synchronous) — the poll just makes the assertion robust to either path. */
Then('the background element\'s rendered gradient contains {string}', async function (fragment) {
  const deadline = Date.now() + 3000;
  let img = '';
  while (Date.now() < deadline) {
    img = await browser.execute(() => {
      const el = document.querySelector('app-background');
      return el ? getComputedStyle(el).backgroundImage : '';
    });
    if (img.includes(fragment)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(
    img.includes(fragment),
    `Expected <app-background>'s computed background-image to contain "${fragment}" but got "${img}"`,
  );
});

/** THEN the header element's rendered height is close to <N> pixels —
 *  mirrors header.chrome-axis.spec.ts's own tolerance (toBeCloseTo(N, 0),
 *  i.e. within 0.5px) at the e2e/rendered-DOM level rather than a component
 *  harness, proving the --sd-header-height token reaches the real banner
 *  (#personal-header) through the shipped stylesheet, not just the spec's
 *  isolated mount. */
Then('the header element\'s rendered height is close to {int} pixels', async function (expected) {
  const deadline = Date.now() + 3000;
  let height = -1;
  while (Date.now() < deadline) {
    height = await browser.execute(() => {
      const el = document.getElementById('personal-header');
      return el ? el.getBoundingClientRect().height : -1;
    });
    if (Math.abs(height - expected) <= 1) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(
    Math.abs(height - expected) <= 1,
    `Expected #personal-header's rendered height to be close to ${expected}px but got ${height}px`,
  );
});

/** Read one element's bounding box from the live page, or null when absent. */
async function boxOf(selector) {
  return browser.execute((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  }, [selector]);
}

/** THEN the header controls cluster sits inside the banner box — the e2e twin
 *  of header.chrome-axis.spec.ts "keeps the whole cluster inside a compact
 *  banner": both toggles' boxes must lie within #personal-header's box (0.5px
 *  tolerance, as the spec). A control taller than its banner is exactly what
 *  made "compact" cosmetic before PR #56's second round. Polls briefly so the
 *  ChromeThemeService re-read (a MutationObserver + the hug-theme-change event)
 *  has applied the token before the boxes are read. */
Then('the header controls cluster sits inside the banner box', async function () {
  const controls = ['[data-testid="menubar-mode-toggle"]', '[data-testid="bg-toggle"]'];
  const deadline = Date.now() + 3000;
  let header = null;
  let boxes = [];
  let inside = false;
  while (Date.now() < deadline) {
    header = await boxOf('#personal-header');
    boxes = [];
    for (const sel of controls) boxes.push(await boxOf(sel));
    inside =
      !!header &&
      boxes.every((b) => b && b.top >= header.top - 0.5 && b.bottom <= header.bottom + 0.5);
    if (inside) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(header, 'Expected #personal-header to be rendered');
  assert.ok(
    inside,
    `Expected every header control inside the banner box ${JSON.stringify(header)} but got ${JSON.stringify(boxes)}`,
  );
});

/** THEN the "<testid>" header control is close to <N> pixels tall — the icon
 *  toggles ride --shell-chrome-fit (0.55 × the themed height: 2.5rem → 22px),
 *  pinned at the component level by "shrinks the icon toggles to fit a COMPACT
 *  banner"; asserted here on the shipped stylesheet. Same ±1px tolerance as the
 *  banner-height step above. */
Then('the {string} header control is close to {int} pixels tall', async function (testid, expected) {
  const deadline = Date.now() + 3000;
  let box = null;
  while (Date.now() < deadline) {
    box = await boxOf(`[data-testid="${testid}"]`);
    if (box && Math.abs(box.height - expected) <= 1) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(box, `Expected [data-testid="${testid}"] to be rendered`);
  assert.ok(
    Math.abs(box.height - expected) <= 1,
    `Expected [data-testid="${testid}"] to be close to ${expected}px tall but got ${box.height}px`,
  );
});

/** THEN the header wordmark is hidden — `--sd-header-display: none` strips the
 *  banner (HeaderComponent's `header--chrome-hidden` host class hides the <h1>
 *  wordmark and the gutter) ... */
Then('the header wordmark is hidden', async function () {
  const deadline = Date.now() + 3000;
  let display = 'unread';
  while (Date.now() < deadline) {
    display = await browser.execute(() => {
      const h1 = document.querySelector('#personal-header h1');
      return h1 ? getComputedStyle(h1).display : 'absent';
    });
    if (display === 'none') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.strictEqual(display, 'none', `Expected the banner wordmark to be display:none but got "${display}"`);
});

/** ... AND the controls survive it: the hide switch must never be the lockout
 *  PR #56's second round found (the banner is the only host of the account
 *  menu and the toggles). A control that is still visible proves the row was
 *  stripped, not removed. */
Then('the {string} header control is still visible', async function (testid) {
  await browser.waitForElementVisible(`[data-testid="${testid}"]`, 5000);
  const visible = await browser.execute((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
  }, [`[data-testid="${testid}"]`]);
  assert.ok(visible, `Expected [data-testid="${testid}"] to stay visible with the banner hidden`);
});
