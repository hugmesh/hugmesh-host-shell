import { Component, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { AppComponent } from '../app.component';
import { BackgroundComponent } from '../background/background.component';
import { NotificationToastComponent } from '../notification-toast.component';
import { NotificationToastService } from '../notification-toast.service';
import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { MenuBarModeService } from '../menu/menu-bar-mode.service';

/**
 * SHELL CHROME PLACEMENT (operator requirement, issue #19 comment 2026-08-19:
 * "the animation button, the menu toggle, the notification bell and user menu
 * belong in the title at the top on the right, not in the menu" — and "you left
 * the buttons below so they're duplicated").
 *
 * These specs are deliberately mounted on the WHOLE shell (AppComponent), not on
 * one component, because the defect they pin is a PLACEMENT defect: every control
 * existed and worked, they were just scattered across three templates —
 *   - bg-toggle + menubar-mode toggle: floating position:fixed chrome in
 *     app.component.html, anchored to the BOTTOM-RIGHT corner,
 *   - bell + profile (user) menu: inside menu.component.html's account region,
 *     which unmounts entirely with the bar.
 * A per-component spec can only ever see one of those, so no per-component spec
 * could catch either the wrong home or a leftover duplicate. The whole-shell
 * mount is the smallest scope that can.
 *
 * The contract, for each control:
 *   1. it exists EXACTLY ONCE in the shell (no duplicate left behind), and
 *   2. that one copy is a DESCENDANT of the header banner, and
 *   3. it is NOT inside the menubar or any position:fixed floating container.
 * Plus the header layout contract: the controls sit at the header's inline END,
 * and never overlap the wordmark — at a wide viewport or a phone-width one.
 */

/** Every chrome control the operator named, by its stable test hook. */
const MOVED_CONTROLS: readonly { name: string; selector: string }[] = [
  { name: 'background-animation toggle', selector: '[data-testid="bg-toggle"]' },
  { name: 'menubar-mode (menu) toggle', selector: '[data-testid="menubar-mode-toggle"]' },
  { name: 'notification bell', selector: '.bell-btn' },
  { name: 'user (profile) menu trigger', selector: '[data-testid="profile-trigger"]' },
];

@Component({
  selector: 'app-background',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class BackgroundStub {
  readonly paused = signal(false);
  toggle(): void {
    this.paused.update((v) => !v);
  }
}

@Component({ selector: 'hug-notification-toast', standalone: true, template: '' })
class NotificationToastStub {}

class SessionStub {
  loggedIn = signal(true);
  fullyRegistered = signal(true);
  isUser = computed(() => this.loggedIn());
  isAdmin = signal(false);
  isMod = signal(false);
  isSuperadmin = signal(false);
  isGames = signal(false);
  isGamesAdmin = signal(false);
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

class AnnouncementsStub {
  readonly visible = signal<readonly unknown[]>([]);
  load = jasmine.createSpy('load').and.resolveTo();
}

describe('Shell chrome placement — the named controls live in the header, once', () => {
  let fixture: ComponentFixture<AppComponent>;
  let el: HTMLElement;
  let session: SessionStub;

  beforeEach(async () => {
    session = new SessionStub();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        NotificationToastService,
        { provide: SessionService, useValue: session },
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        { provide: BellNotificationsService, useValue: new BellStub() },
        {
          provide: AnnouncementsService,
          useValue: new AnnouncementsStub() as unknown as AnnouncementsService,
        },
      ],
    })
      .overrideComponent(AppComponent, {
        remove: { imports: [BackgroundComponent, NotificationToastComponent] },
        add: { imports: [BackgroundStub, NotificationToastStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function header(): HTMLElement {
    const h = el.querySelector<HTMLElement>('header#personal-header');
    expect(h).withContext('the shell must render its header banner').toBeTruthy();
    return h!;
  }

  for (const control of MOVED_CONTROLS) {
    it(`the ${control.name} exists exactly once in the whole shell`, () => {
      expect(el.querySelectorAll(control.selector).length)
        .withContext(
          `${control.name} (${control.selector}) must be rendered ONCE — a second ` +
            'copy is the duplication the operator reported',
        )
        .toBe(1);
    });

    it(`the ${control.name} lives inside the header banner`, () => {
      expect(header().querySelector(control.selector))
        .withContext(`${control.name} (${control.selector}) belongs in the header`)
        .toBeTruthy();
    });

    it(`the ${control.name} is not left behind in the menubar`, () => {
      const menu = el.querySelector('#menu');
      expect(menu?.querySelector(control.selector) ?? null)
        .withContext(`${control.name} must not also render inside the menubar`)
        .toBeNull();
    });

    it(`the ${control.name} is not floating position:fixed chrome any more`, () => {
      const node = el.querySelector<HTMLElement>(control.selector)!;
      for (let n: HTMLElement | null = node; n && n !== el; n = n.parentElement) {
        expect(getComputedStyle(n).position)
          .withContext(
            `${control.name}: ancestor <${n.tagName.toLowerCase()}> must not pin the ` +
              'control to a viewport corner',
          )
          .not.toBe('fixed');
      }
    });
  }

  it('groups all four controls in ONE header region rather than four scattered homes', () => {
    const region = header().querySelector<HTMLElement>('[data-testid="header-controls"]');
    expect(region)
      .withContext('the header needs a single controls region to hold them')
      .toBeTruthy();
    for (const control of MOVED_CONTROLS) {
      expect(region!.querySelector(control.selector))
        .withContext(`${control.name} must sit in the header controls region`)
        .toBeTruthy();
    }
  });

  it('right-aligns the controls region against the header inline end', () => {
    const h = header();
    const region = h.querySelector<HTMLElement>('[data-testid="header-controls"]')!;
    const hRect = h.getBoundingClientRect();
    const rRect = region.getBoundingClientRect();
    // Within the header's own inline padding of the end edge: "top right", not
    // centred and not left.
    expect(hRect.right - rRect.right)
      .withContext('controls must hug the header end edge')
      .toBeLessThanOrEqual(40);
    expect(rRect.left)
      .withContext('controls must sit in the END half of the header, not beside the title')
      .toBeGreaterThan(hRect.left + hRect.width / 2);
  });

  it('never overlaps the wordmark — wide viewport or phone width', () => {
    const h = header();
    const h1 = h.querySelector<HTMLHeadingElement>('h1')!;
    const region = h.querySelector<HTMLElement>('[data-testid="header-controls"]')!;

    const intersects = (a: DOMRect, b: DOMRect): boolean =>
      a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

    expect(intersects(h1.getBoundingClientRect(), region.getBoundingClientRect()))
      .withContext('wordmark and controls must not overlap at the default width')
      .toBeFalse();

    // Phone width. The header must reflow (the controls wrap onto their own row)
    // instead of painting the buttons on top of the title.
    el.style.width = '320px';
    fixture.detectChanges();
    expect(intersects(h1.getBoundingClientRect(), region.getBoundingClientRect()))
      .withContext('wordmark and controls must not overlap at 320px either')
      .toBeFalse();
    el.style.width = '';
  });

  it('paints the banner ABOVE the menubar, so its popups are not buried by the bar', () => {
    // Found by measuring the built shell: the user menu's dropdown hangs BELOW
    // the banner's own box and lands on top of `[menu]`, which styles.scss gives
    // `position: relative; z-index: $z-nav`. The banner only had $z-content, so
    // the first ~80px of the open dropdown was painted over and un-clickable.
    // Matching $z-nav is NOT a fix either: at an equal z-index the later element
    // in tree order wins, and `[menu]` comes after the header. Strictly greater
    // is the contract.
    const menu = el.querySelector<HTMLElement>('#menu')!;
    expect(menu).withContext('the menubar host must be rendered').toBeTruthy();
    const menuCs = getComputedStyle(menu);
    expect(menuCs.position)
      .withContext('premise: the bar is positioned, so it competes on z-index at all')
      .not.toBe('static');

    const bannerZ = Number(getComputedStyle(header()).zIndex);
    const menuZ = Number(menuCs.zIndex);
    expect(Number.isFinite(bannerZ))
      .withContext('the banner must declare a z-index, not inherit auto')
      .toBeTrue();
    expect(bannerZ)
      .withContext(`banner z-index ${bannerZ} must outrank the menubar's ${menuZ}`)
      .toBeGreaterThan(menuZ);
  });

  it('hangs the open user menu over the bar rather than tucking it above', () => {
    // The geometric half of the same defect: the dropdown genuinely extends past
    // the banner and into the bar's box, which is why the paint order above is
    // load-bearing rather than theoretical. (A hit test at that band was tried
    // and dropped: it needs the shell pinned into the viewport, and karma keeps
    // every fixture in one shared document, which made it order-dependent. The
    // real overlap was confirmed with a browser probe against the built page.)
    const trigger = header().querySelector<HTMLButtonElement>('[data-testid="profile-trigger"]')!;
    trigger.click();
    fixture.detectChanges();

    const list = el.querySelector<HTMLElement>('#profile-menu-list');
    expect(list).withContext('the dropdown must open').toBeTruthy();
    const listRect = list!.getBoundingClientRect();
    const menuRect = el.querySelector<HTMLElement>('#menu')!.getBoundingClientRect();
    expect(Math.min(listRect.bottom, menuRect.bottom))
      .withContext('the dropdown overlaps the bar, so the two compete on z-index')
      .toBeGreaterThan(Math.max(listRect.top, menuRect.top));
  });

  it('keeps every a11y contract the controls carried in their old homes', () => {
    const h = header();
    const bg = h.querySelector<HTMLButtonElement>('[data-testid="bg-toggle"]')!;
    expect(bg.getAttribute('aria-pressed')).withContext('bg-toggle stays a toggle').not.toBeNull();
    expect(bg.getAttribute('aria-label')).toContain('background animation');
    expect(bg.getAttribute('aria-describedby')).toBe('bg-toggle-help');
    expect(h.querySelector('#bg-toggle-help')).withContext('help target moved with it').toBeTruthy();

    const mode = h.querySelector<HTMLButtonElement>('[data-testid="menubar-mode-toggle"]')!;
    expect(mode.getAttribute('aria-pressed')).withContext('menu toggle stays a toggle').not.toBeNull();
    expect(mode.getAttribute('aria-describedby')).toBe('menubar-mode-help');
    expect(h.querySelector('#menubar-mode-help')).toBeTruthy();

    const bell = h.querySelector<HTMLButtonElement>('.bell-btn')!;
    expect(bell.getAttribute('aria-label')).toBe('Notifications');

    const profile = h.querySelector<HTMLButtonElement>('[data-testid="profile-trigger"]')!;
    expect(profile.getAttribute('aria-haspopup')).toBe('menu');
    expect(profile.getAttribute('aria-expanded')).toBe('false');
    expect(profile.getAttribute('aria-controls')).toBe('profile-menu-list');
    expect(profile.getAttribute('aria-label')).toContain('alice');
  });

  it('the bg-toggle still drives the background component it was unpinned from', () => {
    const bg = header().querySelector<HTMLButtonElement>('[data-testid="bg-toggle"]')!;
    expect(bg.getAttribute('aria-pressed')).toBe('false');
    bg.click();
    fixture.detectChanges();
    expect(bg.getAttribute('aria-pressed'))
      .withContext('the toggle must still reach the background across its new home')
      .toBe('true');
  });

  it('signed out: the account controls leave, the animation toggle stays', () => {
    session.loggedIn.set(false);
    session.session.set(null);
    fixture.detectChanges();
    const h = header();
    expect(h.querySelector('.bell-btn')).withContext('no bell for anonymous').toBeNull();
    expect(h.querySelector('[data-testid="profile-trigger"]')).toBeNull();
    expect(h.querySelector('[data-testid="menubar-mode-toggle"]')).toBeNull();
    expect(h.querySelector('[data-testid="bg-toggle"]'))
      .withContext('the animation toggle is not session-gated')
      .toBeTruthy();
  });

  // ── THE SIGN-IN ENTRY: THE CHROME THAT DELIBERATELY DID *NOT* MOVE ─────────
  // The four controls above moved into the header. "Sign in" did not — it is a
  // navigation destination, so it stayed in the menubar behind
  // menu.component.html's `@if (!session.loggedIn())`.
  //
  // WHY THIS INVARIANT IS PINNED AT SHELL SCOPE AND NOT ONLY ON MenuComponent:
  // its component-scope guard has already been lost once. PR #37 re-pointed the
  // account suite from MenuComponent to HeaderControlsComponent and carried
  // `expect(has('nav-login')).toBeFalse()` across with it — into a component that
  // renders no nav-login in ANY session state, so it became true by construction
  // and could no longer fail. Removing the gate from menu.component.html left the
  // whole 605-spec suite green.
  //
  // A component-scoped assertion is only as good as its aim, and re-homing the
  // markup silently re-aims it. These name NO component: they ask what the WHOLE
  // shell offers the visitor. Move the entry into the header, into the footer, or
  // into a new component tomorrow and they still guard the same real thing — the
  // question "is a signed-in user being offered a way to sign in?" has one answer
  // per rendered page, not one per component.
  //
  // Each is also self-validating: the absence half is always preceded, in the same
  // fixture, by the presence half. A negative assertion whose selector matches
  // nothing anywhere is indistinguishable from a passing one.
  describe('the Sign-in entry is offered to anonymous visitors only', () => {
    const SIGN_IN = '[data-testid="nav-login"]';
    const signInNodes = () => el.querySelectorAll(SIGN_IN);

    beforeEach(() => {
      // The bar's own render gate must not decide this. Pin 'static' so the
      // menubar is on screen either way, and set the signal rather than
      // setMode() so the spec leaves no localStorage behind for its neighbours.
      TestBed.inject(MenuBarModeService).mode.set('static');
      fixture.detectChanges();
    });

    function goAnonymous(): void {
      session.loggedIn.set(false);
      session.session.set(null);
      fixture.detectChanges();
    }

    function goAuthenticated(): void {
      session.loggedIn.set(true);
      session.session.set({ label: 'alice' });
      fixture.detectChanges();
    }

    it('anonymous: the shell offers Sign in exactly once, and it is in the menubar', () => {
      goAnonymous();
      expect(signInNodes().length)
        .withContext('an anonymous visitor gets one way in — not zero, not two')
        .toBe(1);
      expect(el.querySelector('#menu')?.querySelector(SIGN_IN) ?? null)
        .withContext('Sign in is navigation, so it stayed in the menubar')
        .toBeTruthy();
      expect(header().querySelector(SIGN_IN))
        .withContext('Sign in was NOT one of the controls that moved to the header')
        .toBeNull();
    });

    it('signed in: the shell offers Sign in NOWHERE — this is the guard PR #37 lost', () => {
      goAnonymous();
      // Positive control first: proves the selector resolves in this fixture, so
      // the assertion below cannot pass merely by matching nothing.
      expect(signInNodes().length).withContext('renderable while anonymous').toBe(1);

      goAuthenticated();
      expect(signInNodes().length)
        .withContext(
          'a signed-in user must not be offered "Sign in" anywhere in the shell — ' +
            'not the menubar, not the header, not anywhere else',
        )
        .toBe(0);
    });

    it('the offer follows the session both ways, with no navigation', () => {
      goAuthenticated();
      expect(signInNodes().length).withContext('withheld while signed in').toBe(0);
      goAnonymous();
      expect(signInNodes().length)
        .withContext('signing out must restore the way back in')
        .toBe(1);
      goAuthenticated();
      expect(signInNodes().length).withContext('and withhold it again').toBe(0);
    });
  });
});
