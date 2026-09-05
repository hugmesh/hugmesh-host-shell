import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FooterComponent } from './footer.component';

/**
 * THE GENERATOR'S CHROME AXIS, FOOTER HALF (issue #19 items 4 + 8) — the twin of
 * header.chrome-axis.spec.ts; read that file's header for why this axis existed
 * for months with zero consumers and why these specs measure rendered geometry
 * rather than reading the stylesheet back.
 *
 * Token values are the literal output of theme.chrome_tokens(), captured
 * 2026-09-04:
 *   chrome_tokens(footer_size='compact', footer_bg='#f5f0e6',
 *                 footer_text='Operated by the Ninth Ward\nAll times UTC')
 *   -> --sd-footer-height: 2.5rem; --sd-footer-bg: #f5f0e6;
 *      --sd-footer-on: #000000;
 *      --sd-footer-content: 'Operated by the Ninth Ward\A All times UTC'
 */
@Component({
  imports: [FooterComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<footer personal-footer></footer>',
})
class HostComponent {}

describe('Footer chrome axis (--sd-footer-*)', () => {
  let fixture: ComponentFixture<HostComponent>;
  const applied: string[] = [];

  async function mount(tokens: Record<string, string> = {}): Promise<HTMLElement> {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value);
      applied.push(name);
    }
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const footer = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'footer[personal-footer]',
    );
    expect(footer).withContext('the host must render the footer').toBeTruthy();
    return footer!;
  }

  afterEach(() => {
    for (const name of applied) document.documentElement.style.removeProperty(name);
    applied.length = 0;
  });

  it('renders the shipped footer when the theme sets no chrome token', async () => {
    const footer = await mount();
    expect(getComputedStyle(footer).display).toBe('block');
    expect(footer.querySelector('a[href*="hugmesh-host-shell"]'))
      .withContext('the shipped content is the page-source link')
      .toBeTruthy();
    expect(footer.querySelector('.footer__content')).toBeNull();
    // 32px mark: the un-themed no-op sentinel must not have shrunk it.
    expect(footer.querySelector('svg')!.getBoundingClientRect().height).toBeCloseTo(32, 0);
  });

  it('HIDES the footer outright on --sd-footer-display: none', async () => {
    const footer = await mount({ '--sd-footer-display': 'none' });
    expect(getComputedStyle(footer).display).toBe('none');
    expect(footer.getBoundingClientRect().height).toBe(0);
  });

  it('honours the --hug-footer-display runtime twin when only it is set', async () => {
    expect(getComputedStyle(await mount({ '--hug-footer-display': 'none' })).display).toBe('none');
  });

  it('shrinks its CONTENT for a compact height, not just its box', async () => {
    const footer = await mount({ '--sd-footer-height': '2.5rem' });
    expect(footer.getBoundingClientRect().height).toBeCloseTo(40, 0);
    // 2.5rem * 0.55 = 1.375rem = 22px. Without this cap the 32px mark plus its
    // 8px gutter is already 40px and "compact" would buy exactly nothing.
    expect(footer.querySelector('svg')!.getBoundingClientRect().height).toBeCloseTo(22, 0);
  });

  it('renders TALL as 96px', async () => {
    expect((await mount({ '--sd-footer-height': '6rem' })).getBoundingClientRect().height)
      .toBeCloseTo(96, 0);
  });

  it('GROWS past a themed height rather than clipping the operator line', async () => {
    // Four lines cannot fit in 40px by any arithmetic; a footer that measures
    // 40px here is a footer clipping what the operator typed.
    const footer = await mount({
      '--sd-footer-height': '2.5rem',
      '--sd-footer-content':
        "'Operated by the Ninth Ward\\A meeting weekly\\A since 2019\\A all welcome'",
    });
    expect(footer.querySelector('.footer__content')!.textContent!.split('\n').length).toBe(4);
    expect(footer.getBoundingClientRect().height).toBeGreaterThan(60);
  });

  it('CENTRES its content inside a tall footer', async () => {
    const footer = await mount({ '--sd-footer-height': '6rem' });
    const inner = footer.querySelector<HTMLElement>('.github')!;
    const f = footer.getBoundingClientRect();
    const i = inner.getBoundingClientRect();
    expect(i.top - f.top).toBeCloseTo(f.bottom - i.bottom, 0);
    expect(i.top - f.top).withContext('there IS slack to distribute at 6rem').toBeGreaterThan(10);
  });

  it('paints the themed flat background over the glass scrim', async () => {
    const style = getComputedStyle(await mount({ '--sd-footer-bg': '#f5f0e6' }));
    expect(style.backgroundImage).toContain('rgb(245, 240, 230)');
    expect(style.backgroundColor).toContain('rgba(17, 17, 17');
  });

  it('renders the replacement footer line as REAL TEXT', async () => {
    const footer = await mount({
      '--sd-footer-content': "'Operated by the Ninth Ward\\A All times UTC'",
    });
    const line = footer.querySelector<HTMLElement>('.footer__content');
    expect(line).withContext('the operator line must be in the DOM, not in a pseudo-element')
      .toBeTruthy();
    // The \A escape is the generator's newline. `white-space: pre-line` is what
    // makes it a real second line rather than one run of text.
    expect(line!.textContent).toBe('Operated by the Ninth Ward\nAll times UTC');
    expect(getComputedStyle(line!).whiteSpace).toBe('pre-line');
    expect(line!.getBoundingClientRect().height)
      .withContext('two lines of text are taller than one')
      .toBeGreaterThan(parseFloat(getComputedStyle(line!).fontSize) * 1.5);
  });

  it('replaces the shipped content — the footer carries no control to lose', async () => {
    const footer = await mount({ '--sd-footer-content': "'Operated by the Ninth Ward'" });
    expect(footer.querySelector('a[href*="hugmesh-host-shell"]'))
      .withContext('"replacement content" means replacement')
      .toBeNull();
  });

  it('paints the operator line in the derived -on twin', async () => {
    const footer = await mount({
      '--sd-footer-bg': '#f5f0e6',
      '--sd-footer-on': '#000000',
      '--sd-footer-content': "'Operated by the Ninth Ward'",
    });
    // Black on #f5f0e6 — legibility by construction, derived on the generator
    // side by luminance rather than chosen here by taste.
    expect(getComputedStyle(footer.querySelector<HTMLElement>('.footer__content')!).color)
      .toBe('rgb(0, 0, 0)');
  });

  // ── THE SHIPPED CONTENT TAKES THE TWIN TOO ─────────────────────────────────
  // `footer_bg` WITHOUT `footer_text` is a combination chrome_tokens() emits
  // happily — each axis is independent — so the shipped page-source mark is on
  // the operator's colour with no replacement line to hide it. Measured on the
  // built bundle with footer_bg='#ffffff': :host carried rgb(0,0,0) from the
  // twin and .footer__content correctly inherited it, while the link that
  // actually renders in that branch stayed #bbbbbb at 1.92:1.
  it('paints the SHIPPED page-source mark in the derived twin on a themed footer', async () => {
    const footer = await mount({ '--sd-footer-bg': '#ffffff', '--sd-footer-on': '#000000' });
    const link = footer.querySelector<HTMLElement>('a[href*="hugmesh-host-shell"]')!;
    expect(getComputedStyle(link).color)
      .withContext('1.92:1 against #ffffff is what the literal measured here')
      .toBe('rgb(0, 0, 0)');
  });

  it('keeps the shipped mark colour when no footer colour is themed', async () => {
    const footer = await mount();
    const link = footer.querySelector<HTMLElement>('a[href*="hugmesh-host-shell"]')!;
    expect(getComputedStyle(link).color).withContext('$light, byte for byte').toBe('rgb(187, 187, 187)');
  });

  it('honours the --hug-footer-on runtime twin on the shipped mark', async () => {
    const footer = await mount({ '--hug-footer-on': '#000000' });
    expect(getComputedStyle(footer.querySelector<HTMLElement>('a[href*="hugmesh-host-shell"]')!).color)
      .toBe('rgb(0, 0, 0)');
  });

  // ── ONE RATIO FOR TEXT, ONE FOR BOXES ──────────────────────────────────────
  it('sizes the operator line on the CAP, the same ratio the wordmark uses', async () => {
    const footer = await mount({
      '--sd-footer-height': '2.5rem',
      '--sd-footer-content': "'Operated by the Ninth Ward'",
    });
    // --shell-chrome-cap is 0.45 of the themed height (18px at compact) and caps
    // TEXT; --shell-chrome-fit is 0.55 and caps BOXES (the 22px mark above).
    // Taking 0.45 OF THE FIT compounds to 0.2475 of the height and rendered the
    // operator's own line at 9.9px, against the banner's 18px for the same job.
    // min(0.9375rem, 18px) is 15px: the shipped size, uncompounded.
    expect(parseFloat(getComputedStyle(footer.querySelector<HTMLElement>('.footer__content')!).fontSize))
      .withContext('9.9px here is the compounded-ratio regression')
      .toBeCloseTo(15, 0);
  });

  it('leaves the operator line at its shipped size when no height is themed', async () => {
    const footer = await mount({ '--sd-footer-content': "'Operated by the Ninth Ward'" });
    expect(parseFloat(getComputedStyle(footer.querySelector<HTMLElement>('.footer__content')!).fontSize))
      .toBeCloseTo(15, 0);
  });
});
