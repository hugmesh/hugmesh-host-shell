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
  it('HIDES the banner outright on --sd-header-display: none', async () => {
    const header = await mount({ '--sd-header-display': 'none' });
    expect(getComputedStyle(header).display)
      .withContext('the operator ticked "hide the header entirely"')
      .toBe('none');
    // display:none also removes it from the accessibility tree, which is the
    // point: a hidden banner must not be announced, not merely unpainted.
    expect(header.getBoundingClientRect().height).toBe(0);
  });

  it('honours the --hug-header-display runtime twin when only it is set', async () => {
    const header = await mount({ '--hug-header-display': 'none' });
    expect(getComputedStyle(header).display).toBe('none');
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
});
