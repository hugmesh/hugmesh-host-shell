import { TestBed } from '@angular/core/testing';

import { ChromeThemeService } from './chrome-theme.service';
import { THEME_CHANGE_EVENT } from '../background/background.component';

/**
 * THE LIVE HALF OF THE CHROME CONTRACT — the wiring that was entirely untested.
 *
 * `ChromeThemeService.watch()` exists because the runtime theme is NOT present at
 * bootstrap: `docker-entrypoint.d/50-hug-theme.sh` writes `hug-theme.css` at
 * container start and `index.html` `<link>`s it, so the stylesheet is routinely
 * still in flight when Angular runs. Its docstring calls four triggers
 * load-bearing — head mutations, root attribute changes, a stylesheet finishing
 * loading, and the shell's own `hug-theme-change` event.
 *
 * An independent mutation battery deleted the whole `this.watch()` call and all
 * 664 specs stayed green: the entire live-update path had no test, so a theme
 * arriving one frame after boot would have silently rendered the shipped chrome
 * for the rest of the page's life with nothing to catch it. Each trigger below is
 * therefore exercised in ISOLATION — the ones that must not also fire are driven
 * through CSSOM `insertRule`, which changes no DOM node and so wakes neither
 * MutationObserver.
 */
describe('ChromeThemeService — the theme arriving AFTER bootstrap', () => {
  const added: Element[] = [];

  /** The service coalesces a burst of mutations into one read per frame, so a
   *  trigger is only observable on the far side of a frame. Two, to clear the
   *  microtask hop a MutationObserver callback takes first. */
  function nextFrame(): Promise<void> {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  /** A `<style>` in the head — the shape the real theme arrives in. */
  function appendStyle(css: string): HTMLStyleElement {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    added.push(el);
    return el;
  }

  afterEach(() => {
    for (const el of added) el.remove();
    added.length = 0;
    document.documentElement.style.removeProperty('--sd-header-content');
    document.documentElement.style.removeProperty('--sd-footer-content');
    document.documentElement.style.removeProperty('--sd-header-display');
  });

  it('reads nothing when the theme says nothing', () => {
    const service = TestBed.inject(ChromeThemeService);
    expect(service.content('header')()).toBeNull();
    expect(service.content('footer')()).toBeNull();
    expect(service.hidden('header')()).toBeFalse();
  });

  it('picks up a theme STYLESHEET appended to the head after boot', async () => {
    const service = TestBed.inject(ChromeThemeService);
    expect(service.content('footer')()).toBeNull();

    appendStyle(":root:root { --sd-footer-content: 'Operated by the Ninth Ward'; }");
    await nextFrame();

    expect(service.content('footer')())
      .withContext('the head observer is what makes a late <link> land')
      .toBe('Operated by the Ninth Ward');
  });

  it('picks up a token set on the ROOT ELEMENT after boot', async () => {
    const service = TestBed.inject(ChromeThemeService);
    document.documentElement.style.setProperty('--sd-header-content', "'Late Wordmark'");
    await nextFrame();
    expect(service.content('header')()).toBe('Late Wordmark');
  });

  it('picks up a theme swap announced by the shell hug-theme-change event', async () => {
    // ISOLATION: the token is inserted through CSSOM, which mutates no node, so
    // neither observer can fire and only the event can explain the update.
    const sheet = appendStyle('').sheet!;
    const service = TestBed.inject(ChromeThemeService);
    await nextFrame();

    sheet.insertRule(":root:root { --sd-footer-content: 'Swapped'; }", 0);
    expect(service.content('footer')()).withContext('nothing has told it yet').toBeNull();

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    await nextFrame();
    expect(service.content('footer')()).toBe('Swapped');
  });

  it('picks up a stylesheet that finishes LOADING after boot', async () => {
    // The listeners are attached at construction to the links already in the
    // document, so the link has to exist first — exactly the production ordering,
    // where index.html carries the <link> and the file is written by the
    // container entrypoint.
    // No href on purpose: a link that really loads fires its own `load` before
    // the assertion can, consuming the service's `{ once: true }` listener and
    // making a broken wiring look green. The synthetic dispatch below has to be
    // the ONLY load this link ever sees.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    added.push(link);

    const sheet = appendStyle('').sheet!;
    const service = TestBed.inject(ChromeThemeService);
    await nextFrame();

    sheet.insertRule(":root:root { --sd-header-content: 'Loaded Late'; }", 0);
    link.dispatchEvent(new Event('load'));
    await nextFrame();

    expect(service.content('header')()).toBe('Loaded Late');
  });

  // ── the HIDE axis, which the header consumes in code ────────────────────────
  it('exposes --sd-header-display: none as a hidden signal', async () => {
    const service = TestBed.inject(ChromeThemeService);
    expect(service.hidden('header')()).toBeFalse();

    appendStyle(':root:root { --sd-header-display: none; }');
    await nextFrame();

    expect(service.hidden('header')())
      .withContext('a theme that arrives late must still collapse the banner')
      .toBeTrue();
  });

  it('does not call a non-hide display value a hide', async () => {
    const service = TestBed.inject(ChromeThemeService);
    appendStyle(':root:root { --sd-header-display: block; }');
    await nextFrame();
    expect(service.hidden('header')()).toBeFalse();
  });

  it('honours the --hug-header-display runtime twin', async () => {
    const service = TestBed.inject(ChromeThemeService);
    appendStyle(':root:root { --hug-header-display: none; }');
    await nextFrame();
    expect(service.hidden('header')()).toBeTrue();
  });

  it('stops watching once destroyed', async () => {
    const service = TestBed.inject(ChromeThemeService);
    service.ngOnDestroy();

    appendStyle(":root:root { --sd-footer-content: 'After Destroy'; }");
    await nextFrame();

    expect(service.content('footer')())
      .withContext('a torn-down service must not keep observing the document')
      .toBeNull();
  });
});
