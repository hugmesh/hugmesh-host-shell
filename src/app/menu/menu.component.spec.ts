import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { MenuComponent } from './menu.component';
import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { BellNotificationsService } from '../bell/bell-notifications.service';

/**
 * The UNIVERSAL NAV menubar: Home | Mastodon | Matrix. Home is always enabled;
 * Mastodon/Matrix are enabled only once the session is fully registered (matching
 * the registeredGuard) — so the enabled arrow-key cycle is [0] when unregistered
 * and [0, 1, 2] when registered.
 *
 * These specs assert the WAI-ARIA menubar contract end to end:
 *   - role=menubar on the ul, role=menuitem on each entry,
 *   - true ROVING tabindex (exactly one enabled item is tabindex 0),
 *   - disabled (unregistered) social entries get aria-disabled + tabindex -1,
 *   - the onMenuKeydown keyboard suite (Arrow/Home/End/wrap/skip-disabled),
 *   - unrelated keys (Tab/Enter) are no-ops.
 */
class SessionStub {
  loggedIn = signal(true);
  fullyRegistered = signal(true);
  // MIRRORS SessionService.isUser (session.service.ts:114) — `loggedIn()`, not a
  // separate flag. The menu started calling session.isUser() (menu.component.ts:126
  // for the forum entry, :167 in the nav gate) and this stub was never given it, so
  // every spec that renders the menu died on `this.session.isUser is not a function`
  // — 90 of the suite's 91 failures, all one missing member. Derived rather than an
  // independent signal so it cannot drift from loggedIn the way a literal would.
  isUser = computed(() => this.loggedIn());
  isAdmin = signal(false);
  isMod = signal(false);
  isSuperadmin = signal(false);
  isGames = signal(false);
  isGamesAdmin = signal(false);
  roles = signal<string[]>([]);
  session = signal<{ label: string } | null>({ label: 'alice' });
  cleared = false;
  hasRole(role: string) { return this.roles().some((r) => r.toLowerCase() === role.toLowerCase()); }
  // ASYNC, mirroring the real SessionService.clear(): it now awaits POST /bff/sessionOut so
  // the cookie is dead before anything can re-read it. A sync stub here would let
  // menu.logout() resolve in an order the real one cannot.
  async clear() { this.cleared = true; this.loggedIn.set(false); this.session.set(null); }
}

/** The bell service is still injected by the bar (its AUTO-mode content gate reads
 *  the unread count), even though the BELL ITSELF moved to the header banner. */
class BellNotificationsServiceStub {
  unreadCount$ = of(0);
  startPolling = jasmine.createSpy('startPolling');
  stopPolling = jasmine.createSpy('stopPolling');
}

describe('MenuComponent — universal nav menubar', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;
  let stub: SessionStub;
  let caps: CapabilitiesStub;
  let el: HTMLElement;

  beforeEach(async () => {
    stub = new SessionStub();
    caps = new CapabilitiesStub();
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: stub },
        { provide: CapabilitiesService, useValue: caps },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function navButtons(): HTMLElement[] {
    return component.navButtonRefs.map((ref) => ref.nativeElement);
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a <nav> with a role="menubar" primary list', () => {
    expect(el.querySelector('nav')).toBeTruthy();
    expect(el.querySelector('ul[role="menubar"]')).toBeTruthy();
  });

  it('renders Home | Mastodon | Matrix as the menubar entries', () => {
    const labels = navButtons().map((b) => b.textContent?.trim());
    // Forum joined the menubar deliberately (menu.component.ts:118-128: it had a
    // route, a remote and a capability but no nav entry, so it was unreachable).
    // These specs predate it; the missing isUser() stub member masked the mismatch
    // because every render threw before the comparison ran.
    expect(labels).toEqual(['Home', 'Mastodon', 'Matrix', 'Forum']);
  });

  describe('SIGNED OUT — the menubar is Home only', () => {
    // Operator report: after signing out the shell still listed the service entries and
    // still showed the signed-out user's id. The root cause was that sign-out did not
    // expire the SERVER session (see SessionService.clear) so `loggedIn()` went back to
    // true a tick later; these assert the rendering half, which is what is visible.
    beforeEach(() => {
      stub.loggedIn.set(false);
      stub.session.set(null);
      fixture.detectChanges();
    });

    it('lists ONLY Home — no Mastodon / Matrix / Forum for an anonymous visitor', () => {
      expect(navButtons().map((b) => b.textContent?.trim())).toEqual(['Home']);
    });

    it('does not render the profile trigger, so no user id is shown', () => {
      expect(el.querySelector('[data-testid="nav-user"]')).toBeNull();
    });

    it('signing back in restores the service entries', () => {
      stub.loggedIn.set(true);
      fixture.detectChanges();
      expect(navButtons().map((b) => b.textContent?.trim()))
        .toEqual(['Home', 'Mastodon', 'Matrix', 'Forum']);
    });
  });

  it('Home links to the role-home authgate at "/"', () => {
    const home = navButtons().find((b) => b.textContent?.trim() === 'Home');
    expect(home?.getAttribute('data-route')).toBe('/');
  });

  it('Mastodon and Matrix link to the social remotes', () => {
    const byLabel = (l: string) => navButtons().find((b) => b.textContent?.trim() === l);
    expect(byLabel('Mastodon')?.getAttribute('data-route')).toBe('/social/mastodon');
    expect(byLabel('Matrix')?.getAttribute('data-route')).toBe('/social/matrix');
  });

  describe('roving tabindex (WAI-ARIA menubar)', () => {
    it('makes exactly ONE enabled entry a tab stop (tabindex 0)', () => {
      const tabbable = navButtons().filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabbable.length).toBe(1);
    });

    it('the lone tab stop is Home (activeIndex 0)', () => {
      expect(component.activeIndex).toBe(0);
      expect(navButtons()[0].getAttribute('tabindex')).toBe('0');
    });

    it('non-active enabled entries are tabindex -1 (arrow-reachable only)', () => {
      const mastodon = navButtons().find((b) => b.textContent?.trim() === 'Mastodon');
      expect(mastodon?.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('registration-gated social entries', () => {
    it('disables Mastodon/Matrix when the session is not fully registered', () => {
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      const mastodon = navButtons().find((b) => b.textContent?.trim() === 'Mastodon')!;
      expect(mastodon.hasAttribute('disabled')).toBeTrue();
      expect(mastodon.getAttribute('aria-disabled')).toBe('true');
      expect(mastodon.getAttribute('tabindex')).toBe('-1');
    });

    it('a disabled social entry carries no routerLink', () => {
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      const matrix = navButtons().find((b) => b.textContent?.trim() === 'Matrix');
      expect(matrix?.getAttribute('routerlink')).toBeNull();
    });

    it('enables Mastodon/Matrix once fully registered', () => {
      stub.fullyRegistered.set(true);
      fixture.detectChanges();
      const matrix = navButtons().find((b) => b.textContent?.trim() === 'Matrix')!;
      expect(matrix.hasAttribute('disabled')).toBeFalse();
    });
  });

  describe('install-state gated social entries (federation capabilities)', () => {
    const byLabel = (l: string) => navButtons().find((b) => b.textContent?.trim() === l)!;
    const help = (testid: string) =>
      el.querySelector(`[data-testid="${testid}-help"]`) as HTMLElement | null;

    beforeEach(() => {
      // Registered, so the ONLY remaining gate is install-state.
      stub.fullyRegistered.set(true);
    });

    it('USER-SITUATIONAL: an ABSENT (uninstalled) service is greyed with "not available" helptext', () => {
      caps.setAbsent('matrix');
      fixture.detectChanges();
      const matrix = byLabel('Matrix');
      expect(matrix.hasAttribute('disabled')).toBeTrue();
      expect(matrix.getAttribute('aria-disabled')).toBe('true');
      const reason = help('nav-matrix');
      expect(reason?.textContent).toContain('not available on this deployment');
      expect(matrix.getAttribute('aria-describedby')).toBe('nav-matrix-help');
    });

    it('an installed-but-unregistered service is greyed with a REGISTRATION reason (not install)', () => {
      stub.fullyRegistered.set(false); // installed by default, but not registered
      fixture.detectChanges();
      const mastodon = byLabel('Mastodon');
      expect(mastodon.hasAttribute('disabled')).toBeTrue();
      expect(help('nav-mastodon')?.textContent).toContain('registration');
    });

    it('install-state takes precedence over registration in the reason', () => {
      caps.setAbsent('mastodon');
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      // Both gates fail, but absence is the dominant (unrecoverable) reason.
      expect(help('nav-mastodon')?.textContent).toContain('not available on this deployment');
    });

    it('an installed + registered service is enabled (real <a>, no helptext)', () => {
      caps.installedSlugs.set(new Set(['matrix', 'mastodon']));
      fixture.detectChanges();
      const matrix = byLabel('Matrix');
      expect(matrix.hasAttribute('disabled')).toBeFalse();
      expect(help('nav-matrix')).toBeNull();
    });

    it('the arrow-key cycle skips an absent (uninstalled) service', () => {
      caps.setAbsent('mastodon'); // matrix still installed
      fixture.detectChanges();
      component.activeIndex = 0;
      component.onMenuKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      // index 1 (Mastodon) is absent/disabled -> skipped to index 2 (Matrix).
      expect(component.activeIndex).toBe(2);
    });
  });

  // ── NO DUPLICATE CHROME CONTROLS ───────────────────────────────────────────
  // The operator's second report was "you left the buttons below so they're
  // duplicated". These pin the menubar's HALF of that contract: the four moved
  // controls are simply not renderable from here any more, whatever the session
  // state. header-controls.placement.spec.ts pins the other half (they exist,
  // exactly once, in the header).
  describe('the chrome controls that moved to the header do not come back', () => {
    const MOVED = [
      '[data-testid="bg-toggle"]',
      '[data-testid="menubar-mode-toggle"]',
      '.bell-btn',
      '[data-testid="profile-trigger"]',
      '[data-testid="nav-user"]',
    ];

    it('renders none of them for a signed-in session', () => {
      stub.loggedIn.set(true);
      fixture.detectChanges();
      for (const sel of MOVED) {
        expect(el.querySelector(sel)).withContext(`${sel} belongs to the header now`).toBeNull();
      }
    });

    it('renders none of them for an anonymous session either', () => {
      stub.loggedIn.set(false);
      stub.session.set(null);
      fixture.detectChanges();
      for (const sel of MOVED) {
        expect(el.querySelector(sel)).withContext(`${sel} belongs to the header now`).toBeNull();
      }
    });

    it('still carries the controls that did NOT move (reload, and Sign in when anonymous)', () => {
      expect(el.querySelector('[data-testid="view-reload"]'))
        .withContext('the reload control was never part of the move')
        .toBeTruthy();
      stub.loggedIn.set(false);
      stub.session.set(null);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="nav-login"]'))
        .withContext('Sign in is a navigation destination and stays in the nav')
        .toBeTruthy();
    });
  });

  // ── THE SIGN-IN ENTRY IS SESSION-GATED ───────────────────────────────
  // menu.component.html wraps [data-testid="nav-login"] in `@if
  // (!session.loggedIn())`. This block is that `@if`'s guard, at the scope that
  // owns it: MenuComponent is the ONLY component on main whose template can
  // render the entry, so this is the only place a unit-scope assertion about it
  // can fail.
  //
  // It is restored deliberately. The assertion used to live in the AUTHENTICATED
  // case of the account suite; when that suite was re-pointed from MenuComponent
  // to HeaderControlsComponent (PR #37), the line came along but landed in the
  // ANONYMOUS case of a component that renders no nav-login in ANY session state
  // — so it went true-by-construction and stopped guarding anything. Deleting the
  // guard from menu.component.html left all 605 specs green.
  //
  // The lesson is baked into the shape below: every negative assertion here is
  // preceded, IN THE SAME FIXTURE, by the positive one that proves the selector
  // still resolves. A test that only ever asserts absence cannot tell "correctly
  // hidden" from "renamed, moved away, or never renderable here".
  describe('the anonymous Sign-in entry is gated on the session', () => {
    const signIn = () => el.querySelector('[data-testid="nav-login"]');

    function goAnonymous(): void {
      stub.loggedIn.set(false);
      stub.session.set(null);
      fixture.detectChanges();
    }

    function goAuthenticated(): void {
      stub.loggedIn.set(true);
      stub.session.set({ label: 'alice' });
      fixture.detectChanges();
    }

    it('an anonymous visitor is offered Sign in — signing in takes it away', () => {
      goAnonymous();
      // POSITIVE CONTROL, and not decoration: it proves this fixture CAN render
      // the entry, which is exactly what makes the assertion after it real.
      expect(signIn())
        .withContext('an anonymous visitor must be offered a way in')
        .toBeTruthy();

      goAuthenticated();
      expect(signIn())
        .withContext(
          'a signed-in user must NOT be offered "Sign in" — menu.component.html ' +
            'gates it on @if (!session.loggedIn())',
        )
        .toBeNull();
    });

    it('signing out brings the Sign-in entry back — the gate reads the signal live', () => {
      goAuthenticated();
      expect(signIn()).withContext('gone while signed in').toBeNull();

      goAnonymous();
      // Pins REACTIVITY, not just the boolean: a gate that snapshots the session
      // once (a plain field, a constructor read) passes the test above and fails
      // this one, stranding a signed-out visitor with no way back in.
      expect(signIn())
        .withContext('signing out must restore the entry with no navigation')
        .toBeTruthy();
    });

    it('exactly ONE Sign-in entry renders — never a second copy', () => {
      goAnonymous();
      expect(el.querySelectorAll('[data-testid="nav-login"]').length)
        .withContext('one way in, not two')
        .toBe(1);
    });
  });

  describe('mobile navbar toggler', () => {
    it('has an aria-label for the responsive collapse control', () => {
      const toggler = el.querySelector('.navbar-toggler');
      expect(toggler?.getAttribute('aria-label')).toBe('Toggle navigation');
    });
  });

  describe('onMenuKeydown — keyboard navigation', () => {
    function press(key: string): void {
      component.onMenuKeydown(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    beforeEach(() => {
      // Registered => enabled cycle is [0, 1, 2].
      stub.fullyRegistered.set(true);
      fixture.detectChanges();
      component.activeIndex = 0;
    });

    it('ArrowRight advances to the next enabled entry', () => {
      press('ArrowRight');
      expect(component.activeIndex).toBe(1);
    });

    it('ArrowLeft from the first entry wraps to the last', () => {
      press('ArrowLeft');
      expect(component.activeIndex).toBe(3);
    });

    it('ArrowRight from the last entry wraps back to the first', () => {
      component.activeIndex = 3;   // Forum is the last entry since it joined the menubar
      press('ArrowRight');
      expect(component.activeIndex).toBe(0);
    });

    it('Home jumps to the first entry, End to the last', () => {
      component.activeIndex = 2;
      press('Home');
      expect(component.activeIndex).toBe(0);
      press('End');
      expect(component.activeIndex).toBe(3);
    });

    it('skips disabled social entries when unregistered (cycle = [Home, Forum])', () => {
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      component.activeIndex = 0;
      press('ArrowRight');
      // Mastodon/Matrix stay skipped (registration-gated), but Forum is
      // DELIBERATELY not registration-gated — menu.component.ts:118-128 gates it on
      // isUser() to match forumGuard, precisely so the authenticated-but-unregistered
      // identity the route admits can reach it. So the cycle is [Home, Forum], and
      // "Home is the only enabled entry" stopped being true when Forum landed.
      expect(component.activeIndex).withContext('advances to Forum, the other enabled entry').toBe(3);
      press('ArrowRight');
      expect(component.activeIndex).withContext('wraps back to Home').toBe(0);
    });

    it('moves DOM focus to the newly-active entry', () => {
      const focusSpy = spyOn(component.navButtonRefs.get(1)!.nativeElement, 'focus');
      press('ArrowRight');
      expect(focusSpy).toHaveBeenCalled();
    });

    it('Tab and Enter do not change activeIndex', () => {
      component.activeIndex = 1;
      press('Tab');
      press('Enter');
      expect(component.activeIndex).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Login-page chrome gate (issue #19) — isolated describe block with its own
// TestBed so the REAL router navigation it drives does not leak into the
// suites above. While the login remote is on screen and nobody is signed in,
// the ENTIRE bar unmounts (no Home-only stub); it comes back on login without
// any navigation, and anonymous visitors on the public pages keep their bar.
// ---------------------------------------------------------------------------

describe('MenuComponent — login-page chrome gate', () => {
  let fixture: ComponentFixture<MenuComponent>;
  let stub: SessionStub;
  let router: Router;

  beforeEach(async () => {
    stub = new SessionStub();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        // Componentless, childless routes: the specs only need NavigationEnd to
        // fire with the right URL — nothing renders (the menu sits OUTSIDE the
        // router-outlet in the real shell too).
        provideRouter([
          { path: 'login', children: [] },
          { path: 'login/appeal', children: [] },
          { path: 'home', children: [] },
        ]),
        { provide: SessionService, useValue: stub },
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        { provide: BellNotificationsService, useValue: new BellNotificationsServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  function navbar(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('nav.navbar');
  }

  it('hides the WHOLE bar (not a Home-only stub) on /login while signed out', async () => {
    stub.loggedIn.set(false);
    stub.session.set(null);
    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(navbar()).withContext('no menubar over the login screen').toBeNull();
    // Truly nothing of the bar remains — no nav entries, no Sign-in link.
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="nav-home"]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="nav-login"]')).toBeNull();
  });

  it('hides the bar on the login remote CHILD routes too (/login/appeal)', async () => {
    stub.loggedIn.set(false);
    stub.session.set(null);
    await router.navigateByUrl('/login/appeal');
    fixture.detectChanges();
    expect(navbar()).toBeNull();
  });

  it('brings the bar back the moment the session flips to logged-in — no navigation needed', async () => {
    stub.loggedIn.set(false);
    stub.session.set(null);
    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(navbar()).withContext('hidden while signed out on /login').toBeNull();

    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    expect(navbar()).withContext('menu must come back after login').toBeTruthy();
  });

  it('keeps the anonymous Home + Sign-in bar on PUBLIC pages (/home)', async () => {
    stub.loggedIn.set(false);
    stub.session.set(null);
    await router.navigateByUrl('/home');
    fixture.detectChanges();
    expect(navbar()).withContext('public pages keep the bar').toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="nav-login"]'))
      .withContext('anonymous bar still offers Sign in')
      .toBeTruthy();
  });

  it('keeps the bar for a LOGGED-IN user even on /login', async () => {
    stub.loggedIn.set(true);
    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(navbar()).toBeTruthy();
  });
});
