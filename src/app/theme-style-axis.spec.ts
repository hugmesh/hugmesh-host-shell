import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FooterComponent } from './footer/footer.component';
import { AboutComponent } from './about/about.component';
import { AboutSectionComponent } from './about/about-section/about-section.component';

/**
 * THE THEME'S STYLE AXIS, RENDERED (issue #19 item 8 — "everything in the QT GUI
 * requirements that applies to web").
 *
 * hugmesh-generator's STYLE variants (`theme.py` STYLE_VARIANTS: soft, sharp,
 * outlined, elevated, flat, glass) emit seven shape tokens, and admin-ui's
 * domain-themes editor has offered the axis to operators for months. A census on
 * 2026-09-04 found the host shell consuming NONE of them — 0 hits for
 * `--hug-radius*`, `--hug-border-width`, `--hug-border-style`, `--hug-shadow*`
 * and `--hug-surface-blur` in the whole repo — so an operator who picked "sharp"
 * or "flat" got byte-identical rounded, shadowed chrome and no error anywhere.
 * That is the same silent no-op as the `--sd-`/`--hug-` prefix bug and the inert
 * chrome axis, and it is what these specs close.
 *
 * The token values below are the LITERAL output of `theme.style_tokens(<variant>)`
 * captured on 2026-09-04, so a change on the generator side that these specs
 * would not survive is a change worth noticing.
 *
 * The shell's two shared surface mixins are both covered: `glass-float` (the
 * header/footer/menu/modal chrome) through the footer, and `card-surface` (every
 * panel and card) through an about section. They read different tokens on
 * purpose — chrome takes `--hug-radius-lg` / `--hug-shadow`, cards take
 * `--hug-radius` / `--hug-shadow-sm` — which is exactly the distinction a single
 * shared assertion would have missed.
 */
@Component({
  imports: [FooterComponent, AboutComponent, AboutSectionComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <footer personal-footer></footer>
    <div section><span question>Q</span><span content>A</span></div>
    <div about></div>
  `,
})
class HostComponent {}

/** `theme.style_tokens(...)`, verbatim, twinned to --hug-* the way css_root does. */
const VARIANTS: Record<string, Record<string, string>> = {
  sharp: {
    '--hug-radius': '0', '--hug-radius-sm': '0', '--hug-radius-lg': '0',
    '--hug-border-width': '1px', '--hug-border-style': 'solid',
    '--hug-shadow-sm': 'none', '--hug-shadow': 'none',
  },
  flat: {
    '--hug-radius': '0', '--hug-radius-sm': '0', '--hug-radius-lg': '0',
    '--hug-border-width': '0', '--hug-border-style': 'none',
    '--hug-shadow-sm': 'none', '--hug-shadow': 'none',
  },
  outlined: {
    '--hug-radius': '0.35rem', '--hug-radius-sm': '0.2rem', '--hug-radius-lg': '0.5rem',
    '--hug-border-width': '2px', '--hug-border-style': 'solid',
    '--hug-shadow-sm': 'none', '--hug-shadow': 'none',
  },
  glass: {
    '--hug-radius': '0.9rem', '--hug-radius-sm': '0.55rem', '--hug-radius-lg': '1.25rem',
    '--hug-border-width': '1px', '--hug-border-style': 'solid',
    '--hug-shadow-sm': '0 2px 10px rgba(0,0,0,.30)', '--hug-shadow': '0 12px 40px rgba(0,0,0,.45)',
    '--hug-surface-blur': '10px',
  },
};

describe('Theme STYLE axis (--sd-radius / -border-* / -shadow* / -surface-blur)', () => {
  const applied: string[] = [];
  const probes: HTMLElement[] = [];

  async function mount(tokens: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value);
      applied.push(name);
    }
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fx = TestBed.createComponent(HostComponent);
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    return {
      chrome: getComputedStyle(el.querySelector<HTMLElement>('footer[personal-footer]')!),
      card: getComputedStyle(el.querySelector<HTMLElement>('.section-backpane')!),
      page: getComputedStyle(el.querySelector<HTMLElement>('div[about]')!),
    };
  }

  /**
   * The two STYLE-axis surfaces that live in the GLOBAL stylesheet rather than in
   * a component — the routed-content backpane (`router-outlet + *`) and the help
   * bubble. There is nothing to mount for either, so they are probed as raw DOM
   * against the same `src/styles.scss` karma already loads.
   *
   * They are here because they were the axis's blind spot: a mutation battery
   * that reverted each of their reads to a literal left all 664 specs green,
   * while the README named both surfaces as covered. An unguarded read looks
   * exactly like a guarded one in source.
   */
  function globalProbe(html: string, selector: string) {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    probes.push(host);
    return getComputedStyle(host.querySelector<HTMLElement>(selector)!);
  }

  /** Apply theme tokens without mounting anything. */
  function setTokens(tokens: Record<string, string>) {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value);
      applied.push(name);
    }
  }

  afterEach(() => {
    for (const name of applied) document.documentElement.style.removeProperty(name);
    applied.length = 0;
    for (const probe of probes) probe.remove();
    probes.length = 0;
  });

  it('ships the shell shape when the theme names no style', async () => {
    const { chrome, card } = await mount();
    expect(chrome.borderRadius).withContext('$radius-lg 1.5rem').toBe('24px');
    expect(chrome.borderTopWidth).toBe('1px');
    expect(chrome.borderTopStyle).toBe('solid');
    expect(chrome.boxShadow).withContext('the glass stack, insets included').toContain('inset');
    expect(chrome.backdropFilter).toContain('blur(16px)');
    expect(card.borderRadius).withContext('$radius-card 0.75rem').toBe('12px');
    expect(card.backdropFilter).toContain('blur(6px)');
  });

  it('SHARP squares every corner and removes the elevation', async () => {
    const { chrome, card } = await mount(VARIANTS['sharp']);
    expect(chrome.borderRadius).toBe('0px');
    expect(card.borderRadius).toBe('0px');
    // The whole stack goes, insets included: a "flat" that kept its own glass
    // highlights underneath a themed `none` would mean "slightly less shiny".
    expect(chrome.boxShadow).toBe('none');
    expect(card.boxShadow).toBe('none');
    // …but the border stays, because `sharp` asks for 1px solid.
    expect(chrome.borderTopWidth).toBe('1px');
  });

  it('FLAT also removes the borders', async () => {
    const { chrome, card } = await mount(VARIANTS['flat']);
    expect(chrome.borderTopStyle).toBe('none');
    expect(chrome.borderTopWidth).toBe('0px');
    expect(card.borderTopStyle).toBe('none');
    expect(card.borderTopWidth).toBe('0px');
  });

  it('OUTLINED doubles the border and keeps a small radius', async () => {
    const { chrome, card } = await mount(VARIANTS['outlined']);
    expect(chrome.borderTopWidth).toBe('2px');
    expect(chrome.borderRadius).withContext('0.5rem').toBe('8px');
    expect(card.borderRadius).withContext('0.35rem').toBe('5.6px');
    expect(card.borderTopWidth).toBe('2px');
  });

  it('GLASS reaches the backdrop blur, the one token only it emits', async () => {
    const { chrome, card } = await mount(VARIANTS['glass']);
    expect(chrome.backdropFilter).toContain('blur(10px)');
    expect(card.backdropFilter).toContain('blur(10px)');
    expect(chrome.borderRadius).withContext('1.25rem').toBe('20px');
    expect(chrome.boxShadow).not.toContain('inset');
  });

  it('keeps chrome and cards on DIFFERENT radius tokens', async () => {
    // --hug-radius-lg is the chrome scale, --hug-radius the card scale. A single
    // shared token would collapse the two and lose the shell's own hierarchy.
    const { chrome, card } = await mount({ '--hug-radius-lg': '3rem', '--hug-radius': '1rem' });
    expect(chrome.borderRadius).toBe('48px');
    expect(card.borderRadius).toBe('16px');
  });

  // ── THE CONTRACT SPELLING, NOT ONLY THE RUNTIME TWIN ───────────────────────
  // Every VARIANTS block above sets --hug-* alone, which is how this describe's
  // own title ("--sd-radius / -border-* / -shadow* / -surface-blur") could name a
  // prefix the stylesheets never read. Measured in a browser against the built
  // bundle: injecting the CONTRACT spelling changed the chrome axis (header
  // height moved) and left the style axis untouched, because the style reads had
  // only the --hug-* half. These specs are that asymmetry, closed and pinned.
  it('honours the --sd-* CONTRACT spelling on every style token', async () => {
    const { chrome, card, page } = await mount({
      '--sd-radius': '1rem',
      '--sd-radius-sm': '0.25rem',
      '--sd-radius-lg': '3rem',
      '--sd-border-width': '4px',
      '--sd-border-style': 'dashed',
      '--sd-shadow': 'none',
      '--sd-shadow-sm': 'none',
      '--sd-surface-blur': '2px',
    });
    expect(chrome.borderRadius).withContext('--sd-radius-lg').toBe('48px');
    expect(chrome.borderTopWidth).toBe('4px');
    expect(chrome.borderTopStyle).toBe('dashed');
    expect(chrome.boxShadow).toBe('none');
    expect(chrome.backdropFilter).toContain('blur(2px)');
    expect(card.borderRadius).withContext('--sd-radius').toBe('16px');
    expect(card.boxShadow).toBe('none');
    expect(card.backdropFilter).toContain('blur(2px)');
    expect(page.borderRadius).withContext('page-host takes --sd-radius-lg').toBe('48px');
  });

  it('lets the --sd-* contract name WIN over its --hug-* runtime twin', async () => {
    // Same order, same reason, as the chrome axis: --sd-* is the contract, --hug-*
    // is the twin css_root emits beside it. A read that consults only one side is
    // the prefix bug that made the whole theme a silent no-op for its entire life.
    const { chrome, card } = await mount({
      '--sd-radius-lg': '3rem', '--hug-radius-lg': '0.25rem',
      '--sd-radius': '1rem', '--hug-radius': '0.25rem',
    });
    expect(chrome.borderRadius).toBe('48px');
    expect(card.borderRadius).toBe('16px');
  });

  // ── THE SURFACES THE README NAMES AND NOTHING GUARDED ──────────────────────
  it('reaches the ROUTED-CONTENT BACKPANE', async () => {
    setTokens({ '--sd-radius-lg': '0px', '--sd-border-width': '3px', '--sd-border-style': 'dotted' });
    const pane = globalProbe('<router-outlet></router-outlet><div class="probe"></div>', '.probe');
    expect(pane.borderRadius).toBe('0px');
    expect(pane.borderTopWidth).toBe('3px');
    expect(pane.borderTopStyle).toBe('dotted');
  });

  it('ships the backpane shape when the theme names no style', () => {
    const pane = globalProbe('<router-outlet></router-outlet><div class="probe"></div>', '.probe');
    expect(pane.borderRadius).withContext('$radius-page 1.5rem').toBe('24px');
    expect(pane.borderTopWidth).toBe('1px');
    expect(pane.borderTopStyle).toBe('solid');
  });

  it('reaches the HELP BUBBLE', () => {
    setTokens({ '--sd-radius-sm': '1rem', '--sd-border-width': '2px' });
    const bubble = globalProbe('<span class="help-bubble">h</span>', '.help-bubble');
    expect(bubble.borderRadius).toBe('16px');
    expect(bubble.borderTopWidth).toBe('2px');
  });

  it('ships the help-bubble shape when the theme names no style', () => {
    const bubble = globalProbe('<span class="help-bubble">h</span>', '.help-bubble');
    expect(bubble.borderRadius).withContext('0.375rem').toBe('6px');
    expect(bubble.borderTopWidth).toBe('1px');
  });

  it('reaches the PAGE-HOST mixin, the third shared surface', async () => {
    const { page } = await mount({ '--hug-radius-lg': '0px' });
    expect(page.borderRadius).toBe('0px');
  });

  it('ships the page-host shape when the theme names no style', async () => {
    const { page } = await mount();
    expect(page.borderRadius).withContext('$radius-page 1.5rem').toBe('24px');
  });

  it('does not let the STYLE axis touch the scrim alpha', async () => {
    // t.$scrim-alpha is the WCAG contrast contract, not a taste knob: it is what
    // keeps text legible over the theme's own (unbounded) background gradient.
    const plain = (await mount()).chrome.backgroundColor;
    TestBed.resetTestingModule();
    const styled = (await mount(VARIANTS['flat'])).chrome.backgroundColor;
    expect(styled).toBe(plain);
    expect(styled).toContain('0.82');
  });
});
