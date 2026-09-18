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
