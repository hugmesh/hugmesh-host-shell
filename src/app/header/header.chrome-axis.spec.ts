import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { HeaderComponent } from './header.component';
import { HeaderControlsComponent } from './header-controls.component';
import { SessionService } from '../session.service';
import { BellNotificationsService } from '../bell/bell-notifications.service';

/**
 * THE GENERATOR'S CHROME AXIS, RENDERED (issue #19 items 4 + 8).
 *
 * hugmesh-generator's Themes editor has shipped header/footer hide, size,
 * background and replacement-content controls since `core/theme.py` grew
 * `chrome_tokens()`. A census on 2026-09-04 found ZERO consumers of any of them
 * in the whole web fleet — this repo and hugmesh-login-ui both greppped empty for
 * `--sd-header-*` / `--hug-header-*` — so every one of those QT controls was
 * inert end to end, while this banner scaled itself from `--hug-header-scale`, a
 * hook with no producer anywhere in the generator. These specs are the wire
 * between the two.
 *
 * They assert RENDERED GEOMETRY and COMPUTED STYLE, never markup: "the header is
 * 40px tall", "the wordmark is painted in the derived text twin", not "the
 * stylesheet contains a var()". A `var()` chain that resolves to nothing looks
 * exactly like one that works, in source.
 *
 * The token values used here are the LITERAL output of theme.chrome_tokens(),
 * captured on 2026-09-04:
 *   chrome_tokens(header_size='compact', header_bg='#123456',
 *                 header_text='Council of the Ninth Ward')
 *   -> --sd-header-height: 2.5rem; --sd-header-bg: #123456;
 *      --sd-header-on: #ffffff;   --sd-header-content: 'Council of the Ninth Ward'
 */

@Component({
  selector: 'hug-header-controls',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<span class="stub-control"></span>',
})
class HeaderControlsStub {
  readonly background = input<unknown>(null);
}

@Component({
  imports: [HeaderComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<header personal-header></header>',
})
class HostComponent {}

describe('Header chrome axis (--sd-header-*)', () => {
  let fixture: ComponentFixture<HostComponent>;
  const applied: string[] = [];

  /** Set theme tokens on the real <html>, exactly where snap-theme.css's
   *  `:root:root` block puts them, then mount. Every property set is undone in
   *  afterEach — a spec that leaks a theme poisons every later spec in the run. */
  async function mount(tokens: Record<string, string> = {}): Promise<HTMLElement> {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value);
      applied.push(name);
    }
    await TestBed.configureTestingModule({ imports: [HostComponent] })
      .overrideComponent(HeaderComponent, {
        remove: { imports: [HeaderControlsComponent] },
        add: { imports: [HeaderControlsStub] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const header = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'header[personal-header]',
    );
    expect(header).withContext('the host must render the banner').toBeTruthy();
    return header!;
  }

  afterEach(() => {
    for (const name of applied) document.documentElement.style.removeProperty(name);
    applied.length = 0;
  });

  // ── the conservative-schema guarantee, in rendered form ────────────────────
  it('renders the shipped banner when the theme sets no chrome token at all', async () => {
    const header = await mount();
    const style = getComputedStyle(header);
    expect(style.display).withContext('un-themed banner is a block').toBe('block');
    // `auto` height: taller than the "compact" 2.5rem the theme could ask for,
    // which is what makes the compact assertion below a real measurement rather
    // than a coincidence.
    expect(header.getBoundingClientRect().height)
      .withContext('the shipped banner sizes itself to its content')
      .toBeGreaterThan(40);
    expect(header.querySelector('h1')!.textContent!.trim()).toBe('HugMesh');
  });

  // ── --sd-<s>-display ───────────────────────────────────────────────────────
  // The hide switch is honoured by STRIPPING the banner, not by `display: none`
  // on this host. The footer does take the bare `display` read (see
  // footer.chrome-axis.spec.ts) because it hosts nothing functional; this banner
  // is the shell's only host of sign-out, the profile menu, the role consoles,
  // the notification bell and both toggles, so a `display: none` here is a
  // lockout rather than a restyle. See HeaderComponent.chromeHidden.
  it('STRIPS the banner to nothing on --sd-header-display: none', async () => {
    const header = await mount({ '--sd-header-display': 'none' });
    const style = getComputedStyle(header);
    expect(header.classList.contains('header--chrome-hidden')).toBeTrue();
    // The wordmark and its centring gutter are gone…
    expect(getComputedStyle(header.querySelector<HTMLElement>('h1')!).display).toBe('none');
    expect(getComputedStyle(header.querySelector<HTMLElement>('.header__gutter')!).display)
      .toBe('none');
    // …and so is every painted affordance the banner owns: the glass scrim, the
    // operator's own flat layer, the border, the elevation and the spacing.
    expect(style.backgroundColor).withContext('no scrim').toBe('rgba(0, 0, 0, 0)');
    expect(style.backgroundImage).withContext('no themed layer').toBe('none');
    expect(style.borderTopWidth).toBe('0px');
    expect(style.boxShadow).toBe('none');
    expect(style.paddingTop).toBe('0px');
    expect(style.paddingBottom).toBe('0px');
    expect(style.marginTop).toBe('0px');
    expect(style.marginBottom).toBe('0px');
  });

  it('KEEPS the control cluster when the banner is hidden — hide is not lockout', async () => {
    // The measurement behind this spec: `grep -rl signOut src/app --include=*.html`
    // returns header-controls.component.html and nothing else, so a hidden host
    // took sign-out, the profile menu, the role consoles, the bell and both
    // toggles with it and left no second route to any of them.
    const header = await mount({ '--sd-header-display': 'none' });
    expect(header.querySelector('hug-header-controls'))
      .withContext('the only route to the account menu must survive a hidden banner')
      .toBeTruthy();
    expect(getComputedStyle(header).display)
      .withContext('a display:none host would take the cluster with it')
      .not.toBe('none');
  });

  it('honours the --hug-header-display runtime twin when only it is set', async () => {
    const header = await mount({ '--hug-header-display': 'none' });
    expect(header.classList.contains('header--chrome-hidden')).toBeTrue();
    expect(getComputedStyle(header.querySelector<HTMLElement>('h1')!).display).toBe('none');
  });

  it('does NOT strip the banner for a display value that is not a hide', async () => {
    // `none` is the only value the generator emits, but a hand-written theme may
    // spell the axis back on. Anything that is not a hide leaves the banner whole.
    const header = await mount({ '--sd-header-display': 'block' });
    expect(header.classList.contains('header--chrome-hidden')).toBeFalse();
    expect(header.querySelector('h1')!.textContent!.trim()).toBe('HugMesh');
  });

  it('reads the hide switch case-insensitively, the way CSS keywords work', async () => {
    const header = await mount({ '--sd-header-display': 'NONE' });
    expect(header.classList.contains('header--chrome-hidden')).toBeTrue();
  });

  // ── --sd-<s>-height ────────────────────────────────────────────────────────
  it('renders the COMPACT height as 40px, not as 40px of box around unchanged chrome', async () => {
    const header = await mount({ '--sd-header-height': '2.5rem' });
    const height = header.getBoundingClientRect().height;
    // The whole point of the size axis: the surface actually shrinks. A
    // consumer that set block-size without capping the wordmark and the control
    // buttons would measure the CONTENT height here (min-block-size: fit-content
    // is deliberately allowed to win) and this assertion would fail.
    expect(height).withContext('compact = 2.5rem = 40px at the default root font').toBeCloseTo(40, 0);
  });

  it('renders TALL as 96px', async () => {
    const header = await mount({ '--sd-header-height': '6rem' });
    expect(header.getBoundingClientRect().height).toBeCloseTo(96, 0);
  });

  it('CENTRES the row inside a tall banner rather than parking it at the top', async () => {
    const header = await mount({ '--sd-header-height': '6rem' });
    const bar = header.querySelector<HTMLElement>('.header__bar')!;
    const h = header.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    // Equal slack above and below, within a pixel — the operator asked for a
    // taller header, not for the same header with 56px of empty space under it.
    expect(b.top - h.top).toBeCloseTo(h.bottom - b.bottom, 0);
    expect(b.top - h.top).withContext('there IS slack to distribute at 6rem').toBeGreaterThan(10);
  });

  it('caps the wordmark inside a compact banner instead of overflowing it', async () => {
    const header = await mount({ '--sd-header-height': '2.5rem' });
    const h1 = header.querySelector<HTMLElement>('h1')!;
    // 2.5rem * 0.45 = 1.125rem = 18px — the --shell-chrome-cap ratio.
    expect(parseFloat(getComputedStyle(h1).fontSize)).toBeCloseTo(18, 0);
    expect(h1.getBoundingClientRect().height)
      .withContext('the wordmark must fit inside the banner it was given')
      .toBeLessThanOrEqual(header.getBoundingClientRect().height);
  });

  it('leaves the wordmark ramp untouched when no height is themed', async () => {
    const header = await mount();
    // The un-themed cap sentinel is 100rem * 0.45 = 45rem, so min() is a no-op
    // and the shipped clamp() decides. Anything smaller here would mean the
    // sentinel had shrunk the un-themed banner — a silent restyle.
    expect(parseFloat(getComputedStyle(header.querySelector('h1')!).fontSize)).toBeGreaterThan(18);
  });

  it('GROWS past a themed height rather than clipping content that cannot fit', async () => {
    // min-block-size: fit-content. A height is an intent, never a guillotine.
    // The realistic case is exactly this one: the operator picks `compact` AND
    // types more than a wordmark, so the banner must hold every line of what
    // they wrote. (It is also what protects the narrow layout, where the control
    // cluster takes a second row — a hard 2.5rem there slices the user menu in
    // half.) Four lines at the compact 18px cap cannot fit in 40px by any
    // arithmetic, so a header that measures 40px here is a header that is
    // CLIPPING the operator's own text.
    const header = await mount({
      '--sd-header-height': '2.5rem',
      '--sd-header-content':
        "'Council of the Ninth Ward\\A meeting weekly\\A since 2019\\A all welcome'",
    });
    expect(header.querySelector('h1')!.textContent!.trim().split('\n').length).toBe(4);
    expect(header.getBoundingClientRect().height)
      .withContext('every line of the operator text still renders inside the banner box')
      .toBeGreaterThan(60);
  });

  // ── --sd-<s>-bg / --sd-<s>-on ──────────────────────────────────────────────
  it('paints the themed flat background OVER the glass scrim, not instead of it', async () => {
    const header = await mount({ '--sd-header-bg': '#123456' });
    const style = getComputedStyle(header);
    expect(style.backgroundImage)
      .withContext('the operator colour is layered as a background-image')
      .toContain('rgb(18, 52, 86)');
    // The scrim itself is untouched: its alpha is the shell's contrast contract
    // (t.$scrim-alpha), and re-declaring background-color here would have forked
    // that literal into a second place where it can rot.
    expect(style.backgroundColor)
      .withContext('glass-float keeps owning the scrim')
      .toContain('rgba(17, 17, 17');
  });

  it('paints nothing extra when no background is themed', async () => {
    const style = getComputedStyle(await mount());
    expect(style.backgroundImage).toContain('rgba(0, 0, 0, 0)');
  });

  it('paints the wordmark in the derived -on twin, which OUTRANKS the brand token', async () => {
    // --sd-header-on is pure black/white by luminance on the generator side, so
    // it is the only value guaranteed legible on the operator's chosen colour;
    // --hug-primary-soft is contrast-solved against the PAGE background and
    // knows nothing about a flat header colour.
    const header = await mount({ '--sd-header-bg': '#123456', '--sd-header-on': '#ffffff' });
    expect(getComputedStyle(header.querySelector('h1')!).color).toBe('rgb(255, 255, 255)');
  });

  it('keeps the brand wordmark colour when no header colour is themed', async () => {
    const header = await mount();
    expect(getComputedStyle(header.querySelector('h1')!).color).toBe('rgb(255, 215, 0)');
  });

  // ── --sd-<s>-content ───────────────────────────────────────────────────────
  it('renders the replacement headline as REAL TEXT, not as CSS generated content', async () => {
    const header = await mount({ '--sd-header-content': "'Council of the Ninth Ward'" });
    const h1 = header.querySelector<HTMLElement>('h1')!;
    // textContent is the assertion that matters: a `content:` pseudo-element
    // would satisfy a screenshot and fail this, and it is what keeps the
    // operator's words selectable, translatable and in the accessibility tree.
    expect(h1.textContent!.trim()).toBe('Council of the Ninth Ward');
    expect(h1.querySelector('*')).withContext('plain text node, no wrapper').toBeNull();
  });

  it('drops the brand display face for operator text, keeping the sans stack', async () => {
    // 'More Sugar' is a thin cut chosen for one short wordmark; operator text is
    // arbitrary — a sentence, a domain, another language.
    const themed = await mount({ '--sd-header-content': "'Council of the Ninth Ward'" });
    expect(getComputedStyle(themed.querySelector('h1')!).fontFamily).not.toContain('More Sugar');
  });

  it('keeps the brand display face for the shipped wordmark', async () => {
    const header = await mount();
    expect(getComputedStyle(header.querySelector('h1')!).fontFamily).toContain('More Sugar');
  });

  it('NEVER removes the control cluster — a theme may restyle chrome, not lock the user out', async () => {
    const header = await mount({ '--sd-header-content': "'Council of the Ninth Ward'" });
    expect(header.querySelector('hug-header-controls'))
      .withContext('the bell, user menu and toggles are function, not content')
      .toBeTruthy();
  });

  it('hands a themed height down to the control cluster as --shell-chrome-fit', async () => {
    // The controls live in their own component and cannot see the banner's local
    // Sass; the cap therefore travels as an inherited custom property. Shell
    // -private on purpose: it is layout plumbing, not the cross-repo contract
    // scripts/check-theme-token-contract.sh polices.
    const header = await mount({ '--sd-header-height': '2.5rem' });
    const controls = header.querySelector<HTMLElement>('hug-header-controls')!;
    expect(getComputedStyle(controls).getPropertyValue('--shell-chrome-fit').trim())
      .withContext('the cap must reach the controls, or "compact" only shrinks the box')
      .toContain('2.5rem');
  });
});

/**
 * The SECOND half of the size axis, with the REAL control cluster mounted.
 *
 * The describe above stubs `hug-header-controls` so the banner's own geometry can
 * be measured in isolation, and proves the cap REACHES the cluster as an
 * inherited `--shell-chrome-fit`. That is not the same as proving the cluster
 * OBEYS it: a stylesheet that never reads the property would pass every one of
 * those specs while shipping 2.25rem buttons inside a 2.5rem banner — a taller
 * header than the operator had before they asked for `compact`. So these specs
 * mount the component for real and measure the button.
 */
describe('Header chrome axis — the control cluster obeys a themed height', () => {
  const applied: string[] = [];

  class SessionStub {
    loggedIn = signal(true);
    isAdmin = signal(false);
    isMod = signal(false);
    isSuperadmin = signal(false);
    roles = signal<string[]>([]);
    session = signal<{ label: string } | null>({ label: 'alice' });
    hasRole(role: string) {
      return this.roles().some((r) => r.toLowerCase() === role.toLowerCase());
    }
    async clear() {
      this.loggedIn.set(false);
      this.session.set(null);
    }
  }
  class BellStub {
    unreadCount$ = of(0);
    startPolling = jasmine.createSpy('startPolling');
    stopPolling = jasmine.createSpy('stopPolling');
  }

  async function mountReal(tokens: Record<string, string> = {}): Promise<HTMLElement> {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value);
      applied.push(name);
    }
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: new SessionStub() },
        { provide: BellNotificationsService, useValue: new BellStub() },
      ],
    }).compileComponents();
    const fx = TestBed.createComponent(HostComponent);
    fx.detectChanges();
    return (fx.nativeElement as HTMLElement).querySelector<HTMLElement>('header[personal-header]')!;
  }

  afterEach(() => {
    for (const name of applied) document.documentElement.style.removeProperty(name);
    applied.length = 0;
  });

  it('ships 36px icon toggles when nothing is themed', async () => {
    const toggle = (await mountReal()).querySelector<HTMLElement>('[data-testid="menubar-mode-toggle"]')!;
    // 2.25rem. The un-themed sentinel (100rem * 0.55) must leave this alone.
    expect(toggle.getBoundingClientRect().height).toBeCloseTo(36, 0);
  });

  it('shrinks the icon toggles to fit a COMPACT banner', async () => {
    const header = await mountReal({ '--sd-header-height': '2.5rem' });
    const toggle = header.querySelector<HTMLElement>('[data-testid="menubar-mode-toggle"]')!;
    // 2.5rem * 0.55 = 1.375rem = 22px.
    expect(toggle.getBoundingClientRect().height).toBeCloseTo(22, 0);
    expect(toggle.getBoundingClientRect().height)
      .withContext('a control taller than its banner is what made "compact" cosmetic')
      .toBeLessThan(header.getBoundingClientRect().height);
  });

  it('keeps the whole cluster inside a compact banner', async () => {
    const header = await mountReal({ '--sd-header-height': '2.5rem' });
    const region = header.querySelector<HTMLElement>('[data-testid="header-controls"]')!;
    const h = header.getBoundingClientRect();
    const r = region.getBoundingClientRect();
    expect(r.top).withContext('cluster must not overflow the banner top').toBeGreaterThanOrEqual(h.top - 0.5);
    expect(r.bottom).withContext('cluster must not overflow the banner bottom').toBeLessThanOrEqual(h.bottom + 0.5);
  });

  // ── THE CONTRAST CONTRACT REACHES THE WHOLE SURFACE, NOT JUST THE <h1> ──────
  // Measured on the built bundle with real generator output: with
  // chrome_tokens(header_bg='#f5f5f5') the derived twin --sd-header-on is
  // #000000, :host correctly carried it, the wordmark correctly carried it — and
  // the signed-in account name beside them was still painted --sd-text
  // (rgb(232,232,240)) at 1.12:1 on the operator's colour, because that rule
  // declared `color` explicitly and never inherited the twin. The generator hands
  // this shell the right answer; every element painted ON the surface has to take
  // it. These two specs are that, per control.
  it('paints the ACCOUNT NAME in the derived twin on a themed header', async () => {
    const header = await mountReal({ '--sd-header-bg': '#f5f5f5', '--sd-header-on': '#000000' });
    const trigger = header.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!;
    expect(getComputedStyle(trigger).color)
      .withContext('1.12:1 against #f5f5f5 is what --sd-text measured here')
      .toBe('rgb(0, 0, 0)');
  });

  it('paints the NOTIFICATION BELL in the derived twin on a themed header', async () => {
    const header = await mountReal({ '--sd-header-bg': '#f5f5f5', '--sd-header-on': '#000000' });
    const bell = header.querySelector<HTMLElement>('.bell-btn')!;
    // The bell glyph is stroke="currentColor", so the button's colour IS the icon.
    expect(getComputedStyle(bell).color).toBe('rgb(0, 0, 0)');
  });

  it('keeps the shipped control colour when no header colour is themed', async () => {
    // The other half of the same contract: adding the twin to the front of the
    // chain must not repaint an un-themed deploy. $offwhite, exactly as shipped.
    const header = await mountReal();
    expect(getComputedStyle(header.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!).color)
      .toBe('rgb(232, 232, 232)');
  });

  // ── ONE RATIO FOR TEXT, ONE FOR BOXES ──────────────────────────────────────
  it('sizes the account name on the WORDMARK cap, not on a ratio of the box fit', async () => {
    const header = await mountReal({ '--sd-header-height': '2.5rem' });
    const trigger = header.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!;
    // --shell-chrome-cap is 0.45 of the height (18px at compact) and caps TEXT;
    // --shell-chrome-fit is 0.55 and caps BOXES. Taking 0.45 OF THE FIT compounds
    // to 0.2475 of the height and rendered this at 9.9px while the <h1> two
    // elements away rendered at 18px — two symmetric jobs on two different ratios.
    // min(1rem, 18px) is 16px: the shipped size, uncompounded.
    expect(parseFloat(getComputedStyle(trigger).fontSize))
      .withContext('9.9px here is the compounded-ratio regression')
      .toBeCloseTo(16, 0);
  });

  it('leaves the control type scale alone when no height is themed', async () => {
    const header = await mountReal();
    expect(parseFloat(getComputedStyle(header.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!).fontSize))
      .toBeCloseTo(16, 0);
  });

  it('scales the toggle GLYPH with its button on a compact banner', async () => {
    const header = await mountReal({ '--sd-header-height': '2.5rem' });
    const svg = header.querySelector<SVGElement>('[data-testid="menubar-mode-toggle"] svg')!;
    // 2.5rem * 0.55 * 0.45 = 9.9px inside the 22px button — the glyph stays the
    // same fraction of its button that it is un-themed (16/36), which is what
    // makes `compact` dense rather than empty. The COARSE-POINTER floor is the
    // case this ratio must not follow; see the header-controls stylesheet.
    // BOTH AXES: capping one and not the other renders an ellipse, and a
    // height-only assertion cannot see it.
    const rect = svg.getBoundingClientRect();
    expect(rect.height).toBeCloseTo(9.9, 1);
    expect(rect.width).toBeCloseTo(9.9, 1);
  });

  it('ships a 16px toggle glyph when nothing is themed', async () => {
    const header = await mountReal();
    const rect = header
      .querySelector<SVGElement>('[data-testid="menubar-mode-toggle"] svg')!
      .getBoundingClientRect();
    expect(rect.height).toBeCloseTo(16, 0);
    expect(rect.width).toBeCloseTo(16, 0);
  });

  it('gives the COARSE-POINTER floor to the glyph, not only to its button', async () => {
    // The one assertion in this file that reads the stylesheet instead of the
    // rendering, and it says so. `@media (pointer: coarse)` describes the DEVICE,
    // not the viewport, and karma cannot claim one — so the rendered proof for
    // this rule is a browser probe under pointer emulation (recorded with this
    // change: button 44x44 and glyph 16x16, against 9.89px in a 44px button
    // before). What a spec CAN hold is that the rule exists and does not put the
    // glyph back on the density token, which is exactly the half-applied floor
    // that was measured: the button was already uncapped and the icon inside it
    // was not.
    await mountReal();
    const coarse: CSSStyleRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // a cross-origin sheet; none of ours are
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSMediaRule)) continue;
        if (!/pointer\s*:\s*coarse/.test(rule.conditionText)) continue;
        for (const inner of Array.from(rule.cssRules)) {
          if (inner instanceof CSSStyleRule) coarse.push(inner);
        }
      }
    }
    expect(coarse.length).withContext('the coarse-pointer block must exist at all').toBeGreaterThan(0);

    const glyph = coarse.filter((r) => /\.bg-toggle\b/.test(r.selectorText) && /\bsvg\b/.test(r.selectorText));
    expect(glyph.length).withContext('the coarse block must size the toggle glyph').toBeGreaterThan(0);
    for (const rule of glyph) {
      expect(rule.style.width).withContext(rule.selectorText).toBe('1rem');
      expect(rule.style.height).withContext(rule.selectorText).toBe('1rem');
    }

    const button = coarse.filter(
      (r) => /\.bg-toggle\b/.test(r.selectorText) && !/\bsvg\b/.test(r.selectorText),
    );
    expect(button.length).withContext('…and its button, which is the 2.5.5 target').toBeGreaterThan(0);
    for (const rule of button) expect(rule.style.width).toBe('2.75rem');
  });
});
