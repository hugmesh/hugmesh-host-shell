import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { FooterComponent } from './footer/footer.component';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { MenuComponent } from './menu/menu.component';
import { MENU_BAR_MODE_KEY } from './menu/menu-bar-mode.service';
import { SessionService, SnapSession } from './session.service';
import { CapabilitiesService } from './capabilities/capabilities.service';
import { CapabilitiesStub } from './capabilities/capabilities.stub';
import { BellNotificationsService } from './bell/bell-notifications.service';
import { AnnouncementsService } from './announcements/announcements.service';

/**
 * Scrim legibility contract.
 *
 * <app-background> paints a full-viewport gradient behind everything. Its colours
 * are THEME-SUPPLIED (`--sd-bg-gradient`, see background.component.scss), so they
 * can be any luminance at all — the shipped fallback is a set of near-white
 * pastels, and a themed deploy may legitimately go brighter still.
 *
 * Nothing in this shell paints text straight onto that gradient. Two translucent
 * scrims stand between it and the content:
 *
 *   - `router-outlet + *` (styles.scss)  — the backpane, under every routed view
 *     including the federated remotes (login, Matrix, wiki, forum…).
 *   - `glass-float` (styles/_mixins.scss) — the header / footer / menu chrome.
 *
 * A scrim's ALPHA is what decides whether the palette's contrast ratios survive
 * that composition. Those ratios are quoted against an opaque #0a0a12 and are
 * simply false once the backdrop shows through: at alpha 0.62 the muted token
 * measured 2.5:1 on the live page — the palette comment claims 8.77:1.
 *
 * These tests read the alpha the stylesheets ACTUALLY compile to, composite it
 * over the worst backdrop a theme can produce (pure white) plus every shipped
 * pastel stop, and require WCAG AA on the real result. A regression that trades
 * alpha away for a stronger frost turns them red.
 */

type RGB = [number, number, number];

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: RGB): number {
  const chan = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG 2.x contrast ratio between two opaque colours. */
function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Source-over composite of a translucent scrim onto an opaque backdrop. */
function composite(scrim: RGB, alpha: number, backdrop: RGB): RGB {
  return [0, 1, 2].map(
    (i) => alpha * scrim[i] + (1 - alpha) * backdrop[i],
  ) as RGB;
}

/** Parse a computed `rgb()` / `rgba()` string into channels + alpha. */
function parseColor(css: string): { rgb: RGB; alpha: number } {
  const m = css.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/,
  );
  if (!m) throw new Error(`could not parse colour: ${css}`);
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
}

// WCAG 2.1 SC 1.4.3 Contrast (Minimum), normal-size text.
const AA = 4.5;

/**
 * Worst-case backdrops. Pure white is the bound a themed `--sd-bg-gradient` can
 * reach; the pastels are the compiled fallbacks an un-themed deploy actually
 * serves (styles/_tokens.scss).
 */
const BACKDROPS: ReadonlyArray<readonly [string, RGB]> = [
  ['a themed pure-white gradient', [255, 255, 255]],
  ['$pastel-rose #ffc8dd', [255, 200, 221]],
  ['$pastel-lavender #d0b4f5', [208, 180, 245]],
  ['$pastel-sky #bde0fe', [189, 224, 254]],
  ['$pastel-mint #caffbf', [202, 255, 191]],
  ['$pastel-lemon #fdffb6', [253, 255, 182]],
  ['$pastel-peach #ffd6a5', [255, 214, 165]],
];

/** The text tokens that ride on these scrims (styles.scss :root). */
const FOREGROUNDS: ReadonlyArray<readonly [string, RGB]> = [
  ['--hug-text #e8e8f0', [232, 232, 240]],
  ['--hug-text-muted #a8acc4', [168, 172, 196]],
  ['$offwhite body copy #e8e8e8', [232, 232, 232]],
  ['$neon wordmark/links #ffd700', [255, 215, 0]],
];

/** Assert every token clears AA on `scrim` over every worst-case backdrop. */
function expectScrimIsLegible(label: string, scrim: RGB, alpha: number): void {
  expect(alpha)
    .withContext(`${label}: expected a translucent scrim, got alpha ${alpha}`)
    .toBeLessThanOrEqual(1);

  for (const [bgName, backdrop] of BACKDROPS) {
    const painted = composite(scrim, alpha, backdrop);
    for (const [fgName, fg] of FOREGROUNDS) {
      const ratio = contrast(painted, fg);
      expect(ratio)
        .withContext(
          `${label} (alpha ${alpha}) over ${bgName}: ${fgName} renders at ` +
            `${ratio.toFixed(2)}:1, below WCAG AA ${AA}:1. The scrim is too ` +
            `transparent — raise $scrim-alpha in styles/_tokens.scss.`,
        )
        .toBeGreaterThanOrEqual(AA);
    }
  }
}

describe('scrim legibility over the themeable background gradient', () => {
  it('the routed-content backpane keeps every text token at WCAG AA', () => {
    // src/styles.scss is loaded into the karma bundle (angular.json → test.styles),
    // so the real `router-outlet + *` rule applies to a live DOM probe.
    const host = document.createElement('div');
    host.innerHTML = '<router-outlet></router-outlet><div id="backpane"></div>';
    document.body.appendChild(host);
    try {
      const probe = host.querySelector<HTMLElement>('#backpane')!;
      const { rgb, alpha } = parseColor(
        getComputedStyle(probe).backgroundColor,
      );
      expect(alpha)
        .withContext(
          'the backpane must actually paint a scrim — a fully transparent ' +
            'routed view puts body copy straight on the pastel gradient',
        )
        .toBeGreaterThan(0);
      expectScrimIsLegible('router-outlet + * backpane', rgb, alpha);
    } finally {
      host.remove();
    }
  });

  it('the glass-float chrome keeps every text token at WCAG AA', async () => {
    // FooterComponent is the smallest glass-float consumer; header/menu/profile-modal
    // share the mixin, so one probe covers the idiom.
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    const { rgb, alpha } = parseColor(getComputedStyle(hostEl).backgroundColor);
    expectScrimIsLegible('glass-float chrome', rgb, alpha);
  });
});

// ── THE VIEWS AS ACTUALLY RENDERED ───────────────────────────────────────────
//
// The two specs above probe each scrim in ISOLATION: a bare <div> after a bare
// <router-outlet>, and the footer's own host. Both stayed green while the live
// /home page rendered its gold "Services" heading at 1.06:1 on pale blue — the
// HomeComponent host was the routed view, but its OWN `:host` background
// (`page-host`, a 5% white wash) replaced the backpane. Angular compiles `:host`
// to `[_nghost-…]`, specificity (0,1,0), and the global `router-outlet + *` is
// (0,0,1), so the component rule wins and the 0.82 scrim never paints. The /user
// home had the same hole from the other side: the menu's service cards render
// inside `[menu]`, outside the outlet, with no scrim at all.
//
// So these specs measure the COMPOSITION, not a scrim: they render the real view
// through the real router (or the real menu on the real /user URL), and for every
// visible text node walk the element chain from <body> down, compositing each
// painted background — solid fills and every point along a gradient — over the
// worst-case backdrops, then hold the text's computed colour to WCAG AA on the
// result. A component that paints over the backpane, a surface that loses its
// scrim, or a token too dim for the card it sits on all turn these red.

type RGBA = { rgb: RGB; alpha: number };

/** The colours a gradient can put directly under a glyph: each segment between
 *  two stops sampled at 11 points, interpolated premultiplied (as browsers do). */
function sampleGradient(stops: RGBA[]): RGBA[] {
  if (stops.length === 1) return stops;
  const out: RGBA[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const [a, b] = [stops[i], stops[i + 1]];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const alpha = (1 - t) * a.alpha + t * b.alpha;
      const rgb = [0, 1, 2].map((c) =>
        alpha === 0
          ? 0
          : ((1 - t) * a.alpha * a.rgb[c] + t * b.alpha * b.rgb[c]) / alpha,
      ) as RGB;
      out.push({ rgb, alpha });
    }
  }
  return out;
}

/** Every painted layer from just above <body> down to `el` itself, outermost
 *  first. Each layer lists the colours it can put under a glyph: one for a solid
 *  fill, a sampled run for a gradient. <body> and <html> are excluded on purpose
 *  — the shell's fixed <app-background> gradient paints ABOVE them, which is the
 *  whole reason these tests exist; the worst-case BACKDROPS stand in for it. */
function layersUnder(el: Element): RGBA[][] {
  const chain: Element[] = [];
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    chain.unshift(e);
  }
  const layers: RGBA[][] = [];
  for (const node of chain) {
    const cs = getComputedStyle(node);
    const fill = parseColor(cs.backgroundColor);
    if (fill.alpha > 0) layers.push([fill]);
    const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]*\)/g)].map((m) =>
      parseColor(m[0]),
    );
    if (stops.length) layers.push(sampleGradient(stops));
  }
  return layers;
}

/** Composite every layer, bottom-up, over `backdrop`: all reachable colours. */
function paintedOver(backdrop: RGB, layers: RGBA[][]): RGB[] {
  let painted: RGB[] = [backdrop];
  for (const layer of layers) {
    const next: RGB[] = [];
    for (const base of painted) {
      for (const c of layer) next.push(composite(c.rgb, c.alpha, base));
    }
    painted = next;
  }
  return painted;
}

/** Is `el` painted at all: displayed, visible, and with a real box (a 1px box is
 *  the visually-hidden idiom)? */
function isPainted(el: Element): boolean {
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return false;
  const box = el.getBoundingClientRect();
  return box.width > 1 && box.height > 1;
}

/** Visible elements that directly carry text, minus the WCAG 1.4.3 exemption
 *  for inactive UI components (a greyed, aria-disabled card label — held to its
 *  own floor by expectInactiveCardTextIsDiscernible below). The REASON text
 *  beside a disabled card is not exempt — it is how the user learns why. */
function textCarriers(root: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent?.trim() || out.includes(el)) continue;
    if (el.closest('[aria-disabled="true"]')) continue;
    if (!isPainted(el)) continue; // unpainted or visually-hidden
    out.push(el);
  }
  return out;
}

function describeEl(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? '.' + [...el.classList].join('.') : '';
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return `<${el.tagName.toLowerCase()}${id}${cls}> "${text}"`;
}

/** The LOWEST contrast `el`'s text has against what is really painted beneath it:
 *  its computed colour over every colour its layers can put under a glyph, on
 *  every worst-case backdrop. Names the backdrop that produced it. */
function worstContrast(el: Element): { ratio: number; bg: string; fg: RGBA } {
  const fg = parseColor(getComputedStyle(el).color);
  const layers = layersUnder(el);
  let worst = { ratio: Infinity, bg: '' };
  for (const [bgName, backdrop] of BACKDROPS) {
    for (const under of paintedOver(backdrop, layers)) {
      const text = fg.alpha < 1 ? composite(fg.rgb, fg.alpha, under) : fg.rgb;
      const ratio = contrast(text, under);
      if (ratio < worst.ratio) worst = { ratio, bg: bgName };
    }
  }
  return { ...worst, fg };
}

/** Hold every visible text carrier under `root` to AA on what is really painted
 *  beneath it; returns the carriers so callers can prove the walk was not empty. */
function expectRenderedTextIsLegible(view: string, root: Element): HTMLElement[] {
  const carriers = textCarriers(root);
  for (const el of carriers) {
    const { fg, ...worst } = worstContrast(el);
    expect(worst.ratio)
      .withContext(
        `${view}: ${describeEl(el)} in rgb(${fg.rgb.join(', ')} / ${fg.alpha}) ` +
          `renders at ${worst.ratio.toFixed(2)}:1 over ${worst.bg}, below WCAG ` +
          `AA ${AA}:1. Something between it and the background gradient is too ` +
          `transparent (a routed host repainting the backpane? a surface with no ` +
          `scrim?) or its colour token is too dim for the surface it sits on.`,
      )
      .toBeGreaterThanOrEqual(AA);
  }
  return carriers;
}

/**
 * The text ON a disabled card (its label and description) — the one thing the
 * walk above skips.
 *
 * WCAG 2.1 SC 1.4.3 exempts text that is part of an inactive user interface
 * component, so AA does not bind a greyed card's own text, and it does not meet
 * it: `rgba(t.$light, t.$opacity-muted)` measures 2.00:1 on the composed /user
 * card and 2.04:1 on the /home one, over a pure-white backdrop. That dimness is
 * the affordance — it says "not available to you" before the reason does — and
 * the reason beside the card, which is NOT exempt, is held to AA above.
 *
 * Exempt is not the same as free to vanish. The label is how a member tells
 * which service a reason is about, and since the social cards were gated on
 * their per-service role (GUI-07) a member holding none of those roles gets a
 * /user home made of nothing BUT disabled cards. Skipping this text meant that
 * nothing measured it at all: the disabled grey could be dimmed further, or the
 * text hidden outright, with every spec in this file still green. And a grey
 * that is alpha-blended into its surface only reads while that surface is dark:
 * without the cards' scrim the same labels measure 1.04:1 over white.
 *
 * So this text is held to a floor instead. The floor is a RATCHET set just under
 * what ships, not a WCAG number (there is none for inactive components): making
 * the disabled state MORE legible needs no change here, and dimming it has to be
 * done on purpose.
 */
const INACTIVE_TEXT_FLOOR = 1.9;

/** Hold every disabled card's label and description under `root` to the floor
 *  on what is really painted beneath them; returns them so callers can prove
 *  the walk was not empty. */
function expectInactiveCardTextIsDiscernible(view: string, root: Element): HTMLElement[] {
  const dimmed = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[aria-disabled="true"] .service-card__label, [aria-disabled="true"] .service-card__desc',
    ),
  );
  for (const el of dimmed) {
    expect(isPainted(el))
      .withContext(
        `${view}: ${describeEl(el)} on a disabled card is not painted. A card the ` +
          `member cannot open is greyed and explained, never hidden.`,
      )
      .toBeTrue();
    const { fg, ...worst } = worstContrast(el);
    expect(worst.ratio)
      .withContext(
        `${view}: ${describeEl(el)} on a disabled card, in rgb(${fg.rgb.join(', ')} / ` +
          `${fg.alpha}), renders at ${worst.ratio.toFixed(2)}:1 over ${worst.bg}, below ` +
          `the ${INACTIVE_TEXT_FLOOR}:1 floor for inactive card text. It is exempt from ` +
          `AA (SC 1.4.3) but must not fade into its card: either the surface under it ` +
          `lost its scrim, or the disabled colour was dimmed.`,
      )
      .toBeGreaterThanOrEqual(INACTIVE_TEXT_FLOOR);
  }
  return dimmed;
}

/**
 * The launcher card text must read the THEME's text token, not a fixed grey. On
 * the composed card the old `t.$light` (#bbb) clears AA by a thin margin (5.8:1
 * on the chrome scrim over white, against 9.2:1 for --hug-text), and a theme
 * could not reach it at all. Probed by setting the contract name (--sd-text) and
 * watching the card text follow, which is how a deployed theme arrives.
 */
function expectCardTextFollowsTheme(view: string, root: Element): void {
  const probe = 'rgb(1, 2, 3)';
  // The card link animates `color` (the hover glow). A computed style read during
  // that transition returns its START value, so it is switched off for the probe.
  const still = document.createElement('style');
  still.textContent = '* { transition: none !important; }';
  document.head.appendChild(still);
  document.documentElement.style.setProperty('--sd-text', probe);
  try {
    for (const q of ['.service-card__label', '.service-card__desc']) {
      const el = root.querySelector(`a.service-card__link ${q}`);
      expect(el).withContext(`${view}: an enabled ${q}`).toBeTruthy();
      // The line above IS the failure. Reading a style off null would bury it
      // under a TypeError about getComputedStyle.
      if (!el) continue;
      expect(getComputedStyle(el).color)
        .withContext(`${view}: ${q} must read var(--hug-text), the theme's text token`)
        .toBe(probe);
    }
  } finally {
    document.documentElement.style.removeProperty('--sd-text');
    still.remove();
  }
}

const MEMBER: SnapSession = {
  id: 'google:alice@example.com',
  label: 'alice',
  provider: 'google',
  roles: ['user'],
  registrationComplete: true,
};

describe('scrim legibility — the shell-owned routed views as rendered', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'home', component: HomeComponent },
          { path: 'about', component: AboutComponent },
        ]),
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
      ],
    }).compileComponents();
    // A signed-in member: enabled service cards AND role-gated (disabled) ones,
    // so the launcher's label, description and .field-help reason all render.
    TestBed.inject(SessionService).set(MEMBER);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => localStorage.clear());

  /** Navigate the real router and return the routed host, proving it sits where
   *  the app puts it — as the outlet's next sibling, i.e. `router-outlet + *`. */
  async function routedHost(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    harness.detectChanges();
    const host = harness.routeNativeElement as HTMLElement;
    expect(host.previousElementSibling?.tagName)
      .withContext('the routed view must be the outlet sibling the backpane targets')
      .toBe('ROUTER-OUTLET');
    return host;
  }

  it('/home: the routed host keeps the backpane scrim instead of repainting it', async () => {
    const host = await routedHost('/home');
    const { rgb, alpha } = parseColor(getComputedStyle(host).backgroundColor);
    expectScrimIsLegible('/home routed host', rgb, alpha);
  });

  it('/home: every visible text node clears WCAG AA over the painted composition', async () => {
    const host = await routedHost('/home');
    const checked = expectRenderedTextIsLegible('/home', host);
    // Not vacuous: the surfaces from the field report are all in the walk.
    const sel = (q: string) => checked.some((el) => el.matches(q));
    expect(sel('#services-heading')).withContext('the "Services" heading').toBeTrue();
    expect(sel('.home-section p')).withContext('intro-card body copy').toBeTrue();
    expect(sel('.service-card__label')).withContext('an enabled card label').toBeTrue();
    expect(sel('.service-card__desc')).withContext('an enabled card description').toBeTrue();
    expect(sel('.field-help')).withContext('a disabled card\'s reason').toBeTrue();
    // The cards this member cannot open are greyed, not hidden. Their own text is
    // exempt from AA and held to the inactive floor instead.
    const dimmed = expectInactiveCardTextIsDiscernible('/home', host);
    expect(dimmed.some((el) => el.matches('.service-card__label')))
      .withContext('a disabled card\'s label')
      .toBeTrue();
  });

  it('/home: the launcher card text reads the theme\'s text token', async () => {
    expectCardTextFollowsTheme('/home', await routedHost('/home'));
  });

  it('/home?denied=: the refusal notice and the page under it clear WCAG AA', async () => {
    const host = await routedHost('/home?denied=%2Fadmin');
    const checked = expectRenderedTextIsLegible('/home?denied=/admin', host);
    expect(checked.some((el) => !!el.closest('[data-testid="denied-notice"]')))
      .withContext('the denied notice rendered and was measured')
      .toBeTrue();
  });

  it('/about: shares the page-host mixin, so it is held to the same composition', async () => {
    const host = await routedHost('/about');
    const { rgb, alpha } = parseColor(getComputedStyle(host).backgroundColor);
    expectScrimIsLegible('/about routed host', rgb, alpha);
    expect(expectRenderedTextIsLegible('/about', host).length).toBeGreaterThan(0);
  });
});

describe('scrim legibility — the /user home service cards (menu-owned, outside the outlet)', () => {
  class SessionStub {
    loggedIn = signal(true);
    fullyRegistered = signal(true);
    isUser = computed(() => this.loggedIn());
    isAdmin = signal(false);
    isMod = signal(false);
    isSuperadmin = signal(false);
    // MIRRORS SessionService.isAdminTier (admin OR superadmin) — derived, so it
    // cannot drift from the two flags it is built from.
    isAdminTier = () => this.isAdmin() || this.isSuperadmin();
    isGames = signal(false); // no games role: the Games card is DISABLED, with a reason
    isGamesAdmin = signal(false);
    roles = signal<string[]>(['user']);
    session = signal<{ label: string } | null>({ label: 'alice' });
    hasRole(role: string) {
      return this.roles().some((r) => r.toLowerCase() === role.toLowerCase());
    }
    async clear() {
      this.loggedIn.set(false);
      this.session.set(null);
    }
  }

  // WHO IS LOOKING decides what there is to measure. Every card on the /user home
  // is gated (menu.component.ts navEntries), and since GUI-07 the three social
  // cards are gated on their per-service role: 'matrix', 'mastodon' and 'forum',
  // the names guards/social-access.ts reads. The bare 'user' role enables none of
  // them. So one member cannot show this page's two states: with the roles there
  // is no all-disabled home, and without them there is no enabled card at all.
  // Both members are rendered below, each held to what its state can prove.
  const SERVICE_MEMBER = ['user', 'matrix', 'mastodon', 'forum'];
  const PLAIN_MEMBER = ['user'];

  beforeEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));
  afterEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));

  /** Render the real menu on the real /user URL for a signed-in, registered
   *  member holding `roles`, and return the service-cards panel. */
  async function userHomeCards(roles: string[]): Promise<HTMLElement> {
    const session = new SessionStub();
    session.roles.set(roles);
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'user', children: [] }]),
        { provide: SessionService, useValue: session },
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        {
          provide: BellNotificationsService,
          useValue: {
            unreadCount$: new BehaviorSubject<number>(0),
            startPolling: () => undefined,
            stopPolling: () => undefined,
          },
        },
        {
          provide: AnnouncementsService,
          useValue: { visible: signal([]), load: () => Promise.resolve() },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MenuComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/user');
    fixture.detectChanges();

    const nav = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="home-services-nav"]',
    );
    if (!nav) {
      throw new Error(
        'the /user home did not render the menu as service cards: ' +
          '[data-testid="home-services-nav"] is missing, so there is nothing to measure.',
      );
    }
    return nav;
  }

  /** What the member was actually shown, one entry per card, for the failures
   *  below: `home-card-nav-matrix disabled ("Sign in as a Matrix member…")`. */
  function cardStates(nav: Element): string {
    const cards = Array.from(nav.querySelectorAll('.service-card')).map((card) => {
      const link = card.querySelector('.service-card__link');
      const id = link?.getAttribute('data-testid') ?? 'a card with no link element';
      if (link?.matches('a')) return `${id} enabled`;
      const reason = card.querySelector('.field-help')?.textContent?.trim();
      return `${id} disabled (${reason ? `"${reason}"` : 'no reason shown'})`;
    });
    return cards.length ? cards.join(', ') : 'no cards at all';
  }

  it('every visible card text node clears WCAG AA over the painted composition', async () => {
    const nav = await userHomeCards(SERVICE_MEMBER);
    // A HARD stop, not an expectation: with no enabled card this spec has no
    // enabled card text to measure and every line below would be about something
    // else. This is what a gate change that outruns SERVICE_MEMBER looks like.
    if (!nav.querySelector('a.service-card__link')) {
      throw new Error(
        'no ENABLED service card rendered on the /user home, so there is no enabled ' +
          'card text to measure. SERVICE_MEMBER must hold a role that enables at least ' +
          'one card: see guards/social-access.ts (Matrix, Mastodon, Forum) and the ' +
          `navEntries in menu.component.ts. Rendered: ${cardStates(nav)}.`,
      );
    }
    const checked = expectRenderedTextIsLegible('/user home cards', nav);
    const sel = (q: string) => checked.some((el) => el.matches(q));
    expect(sel('.service-card__label')).withContext('an enabled card label').toBeTrue();
    expect(sel('.service-card__desc')).withContext('an enabled card description').toBeTrue();
    expect(sel('#nav-games-card-help'))
      .withContext('the disabled Games card\'s reason (#nav-games-card-help)')
      .toBeTrue();
    expectCardTextFollowsTheme('/user home cards', nav);
  });

  it('a member without the service roles: every reason clears WCAG AA and every greyed card stays discernible', async () => {
    const view = '/user home cards (no service roles)';
    const nav = await userHomeCards(PLAIN_MEMBER);
    // A HARD stop again: each card GUI-07 gates must be in the refused state, or
    // nothing below is about the state this spec names.
    const refused = ['mastodon', 'matrix', 'forum'].map((id) => {
      const card = nav.querySelector<HTMLElement>(`[data-testid="home-card-nav-${id}"]`);
      if (card?.getAttribute('aria-disabled') !== 'true') {
        throw new Error(
          `the ${id} card is ${card ? 'not marked aria-disabled="true"' : 'not rendered at all'} ` +
            "for a member holding only 'user', so this spec is not measuring the refused " +
            'state it names: a greyed card with its reason beside it. A card the member ' +
            'cannot open is never hidden, and if the gate in guards/social-access.ts now ' +
            'admits this member, PLAIN_MEMBER must become one it still refuses. ' +
            `Rendered: ${cardStates(nav)}.`,
        );
      }
      return { id, card };
    });
    const checked = expectRenderedTextIsLegible(view, nav);
    const dimmed = expectInactiveCardTextIsDiscernible(view, nav);
    // Not vacuous, and by id: before the gate existed the Games reason alone
    // satisfied a bare `.field-help` check. Each refused card's reason AND its
    // own text must both be in what was measured.
    for (const { id, card } of refused) {
      expect(checked.some((el) => el.id === `nav-${id}-card-help`))
        .withContext(
          `the disabled ${id} card's reason (#nav-${id}-card-help) is painted and was measured`,
        )
        .toBeTrue();
      for (const q of ['.service-card__label', '.service-card__desc']) {
        expect(dimmed.some((el) => card.contains(el) && el.matches(q)))
          .withContext(`the disabled ${id} card's ${q} was measured`)
          .toBeTrue();
      }
    }
  });
});
