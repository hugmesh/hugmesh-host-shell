import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { CanActivateFn, Route, Router, Routes, UrlTree, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { REMOTE_ROUTES, federationLoader, routes } from './app.routes';
import { AnnouncementsService } from './announcements/announcements.service';
import { BellNotificationsService } from './bell/bell-notifications.service';
import { CapabilitiesService } from './capabilities/capabilities.service';
import { CapabilitiesStub } from './capabilities/capabilities.stub';
import { forumGuard } from './guards/forum.guard';
import { mastodonGuard } from './guards/mastodon.guard';
import { matrixGuard } from './guards/matrix.guard';
import { canUseForum, canUseMastodon, canUseMatrix } from './guards/social-access';
import { DeniedNoticeComponent } from './home/denied-notice.component';
import { HomeServicesService } from './home-services/home-services.service';
import { MENU_BAR_MODE_KEY } from './menu/menu-bar-mode.service';
import { MenuComponent } from './menu/menu.component';
import { SessionService } from './session.service';

/**
 * GUI-07 (2026-11-11 GUI retest): the shell offered, enabled and MOUNTED Matrix,
 * Mastodon and Forum for personas the backend refuses.
 *
 * Live, on the local mesh, before this fix:
 *   - e2e-user / e2e-mod / e2e-admin / e2e-superadmin (none holds ROLE_MATRIX or
 *     ROLE_MASTODON) all saw ENABLED Matrix + Mastodon cards and nav entries; the
 *     remotes mounted and every /bff/user/matrix|mastodon/** call came back 403
 *     (user-bff MatrixProxyController / MastodonProxyController are
 *     @PreAuthorize("hasRole('MATRIX'|'MASTODON')") with no hierarchy edge into
 *     either role), plus a 403 /bff/user/connected-clients probe on every mount.
 *   - e2e-user / e2e-mod / e2e-matrix saw an ENABLED Forum card; clicking it left
 *     them on /user, because the gateway 403s /social/forum/** without ROLE_FORUM
 *     (CanonicalSeed) and native federation threw on the remoteEntry.
 *
 * This spec drives the REAL SessionService with the role sets those personas
 * actually carry on GET /bff/session, and asserts that every surface — the route
 * guard, the /home launcher card, the menubar entry and the /user home card —
 * gives the SAME answer, and that the answer is the backend's.
 */

/** A persona as GET /bff/session reports it (roles verbatim from the live walk). */
interface Persona {
  readonly name: string;
  /** null = signed out. */
  readonly roles: readonly string[] | null;
  readonly registered: boolean;
  /** What the BACKEND admits — the expected answer on every surface. */
  readonly matrix: boolean;
  readonly mastodon: boolean;
  readonly forum: boolean;
}

const PERSONAS: readonly Persona[] = [
  { name: 'signed out', roles: null, registered: false, matrix: false, mastodon: false, forum: false },
  { name: 'e2e-user', roles: ['user'], registered: true, matrix: false, mastodon: false, forum: false },
  { name: 'e2e-mod', roles: ['mod'], registered: true, matrix: false, mastodon: false, forum: false },
  { name: 'e2e-admin', roles: ['admin', 'user'], registered: true, matrix: false, mastodon: false, forum: true },
  { name: 'e2e-superadmin', roles: ['superadmin'], registered: true, matrix: false, mastodon: false, forum: true },
  { name: 'e2e-matrix', roles: ['matrix', 'user'], registered: true, matrix: true, mastodon: false, forum: false },
  { name: 'e2e-mastodon', roles: ['mastodon', 'user'], registered: true, matrix: false, mastodon: true, forum: false },
  { name: 'e2e-forum', roles: ['forum', 'user'], registered: true, matrix: false, mastodon: false, forum: true },
  {
    name: 'mesh-operator',
    roles: ['admin', 'fleet_admin', 'forum', 'games', 'games_admin', 'mastodon', 'matrix', 'mod', 'superadmin', 'user', 'wiki'],
    registered: true, matrix: true, mastodon: true, forum: true,
  },
  // Registration still gates Matrix/Mastodon (it mints the hsproxy token) but not Forum.
  { name: 'social roles, registration unfinished', roles: ['matrix', 'mastodon', 'forum', 'user'], registered: false, matrix: false, mastodon: false, forum: true },
];

type ServiceId = 'matrix' | 'mastodon' | 'forum';
const SERVICES: ReadonlyArray<{ id: ServiceId; route: string; guard: CanActivateFn; predicate: (s: SessionService) => boolean }> = [
  { id: 'matrix', route: '/social/matrix', guard: matrixGuard, predicate: canUseMatrix },
  { id: 'mastodon', route: '/social/mastodon', guard: mastodonGuard, predicate: canUseMastodon },
  { id: 'forum', route: '/social/forum', guard: forumGuard, predicate: canUseForum },
];

/** Put the REAL SessionService into the persona's state. The localStorage mirror
 *  is written too, so a stray hydrate() (fetch is stubbed to fail -> it re-reads
 *  the mirror) lands on the same value instead of reverting it. */
function signIn(session: SessionService, p: Persona): void {
  if (p.roles === null) {
    localStorage.removeItem('hug.session');
    session.session.set(null);
    return;
  }
  session.set({
    id: `casdoor:${p.name}`,
    label: p.name,
    provider: 'password',
    roles: [...p.roles],
    registrationComplete: p.registered,
  });
}

class BellStub {
  readonly unreadCount$ = new BehaviorSubject<number>(0);
  startPolling = jasmine.createSpy('startPolling');
  stopPolling = jasmine.createSpy('stopPolling');
}

class AnnouncementsStub {
  readonly visible = signal<readonly never[]>([]);
  load = jasmine.createSpy('load').and.resolveTo();
}

describe('social access parity — guard == /home card == menubar == /user card == backend (GUI-07)', () => {
  let session: SessionService;
  let router: Router;
  let cards: HomeServicesService;
  let fixture: ComponentFixture<MenuComponent>;
  let menu: MenuComponent;

  beforeEach(async () => {
    localStorage.clear();
    // hydrate() must never reach a server here: a rejected fetch makes it re-read
    // the mirror signIn() wrote, which is the persona under test.
    spyOn(window, 'fetch').and.rejectWith(new Error('offline in unit tests'));
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'user', children: [] },
          { path: 'about', children: [] },
          { path: 'home', children: [] },
        ]),
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        { provide: BellNotificationsService, useValue: new BellStub() },
        { provide: AnnouncementsService, useValue: new AnnouncementsStub() as unknown as AnnouncementsService },
      ],
    }).compileComponents();
    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
    cards = TestBed.inject(HomeServicesService);
    fixture = TestBed.createComponent(MenuComponent);
    menu = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem(MENU_BAR_MODE_KEY);
    localStorage.removeItem('hug.session');
  });

  function runGuard(guard: CanActivateFn, url: string): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => guard({} as never, { url } as never)) as boolean | UrlTree;
  }

  for (const p of PERSONAS) {
    describe(p.name, () => {
      beforeEach(() => signIn(session, p));

      for (const s of SERVICES) {
        const want = p[s.id];

        it(`${s.id}: the shared predicate says ${want ? 'ADMIT' : 'REFUSE'} (the backend's answer)`, () => {
          expect(s.predicate(session)).toBe(want);
        });

        it(`${s.id}: the route guard ${want ? 'admits' : 'refuses to the right place'}`, () => {
          const result = runGuard(s.guard, s.route);
          if (want) {
            expect(result).toBeTrue();
          } else if (p.roles === null) {
            expect(result).toEqual(router.parseUrl('/login'));
          } else {
            expect(result).toEqual(router.createUrlTree(['/home'], { queryParams: { denied: s.route } }));
          }
        });

        it(`${s.id}: the /home launcher card is ${want ? 'enabled' : 'disabled WITH a reason'}`, () => {
          const card = cards.cards().find((c) => c.id === s.id)!;
          expect(card.state === 'enabled').withContext(`card state ${card.state}`).toBe(want);
          if (!want) expect(card.disabledReason).withContext('a disabled card always explains itself').not.toBe('');
        });

        it(`${s.id}: the menubar entry is ${want ? 'enabled' : p.roles === null ? 'not listed' : 'disabled WITH a reason'}`, () => {
          const entry = menu.navEntries.find((e) => e.testid === `nav-${s.id}`)!;
          const listed = entry.visible ? entry.visible() : true;
          if (p.roles === null) {
            expect(listed).withContext('signed out: service entries are not listed').toBeFalse();
            return;
          }
          expect(listed).toBeTrue();
          expect(entry.enabled()).toBe(want);
          if (!want) expect(entry.disabledReason()).withContext('a disabled entry always explains itself').not.toBe('');
        });
      }

      if (p.roles !== null) {
        it('the /user home cards render each service as a link ONLY when admitted, with a visible reason otherwise', async () => {
          await router.navigateByUrl('/user');
          fixture.detectChanges();
          const el = fixture.nativeElement as HTMLElement;
          for (const s of SERVICES) {
            const card = el.querySelector(`[data-testid="home-card-nav-${s.id}"]`) as HTMLElement | null;
            expect(card).withContext(`${s.id} card rendered`).not.toBeNull();
            expect(card!.tagName).withContext(`${s.id} card element`).toBe(p[s.id] ? 'A' : 'SPAN');
            const help = el.querySelector(`[data-testid="home-card-nav-${s.id}-help"]`) as HTMLElement | null;
            if (p[s.id]) {
              expect(card!.getAttribute('href')).toBe(s.route);
              expect(help).withContext(`${s.id}: an enabled card carries no reason`).toBeNull();
            } else {
              expect(card!.getAttribute('aria-disabled')).toBe('true');
              expect(card!.hasAttribute('href')).withContext(`${s.id}: a refused card is not a link`).toBeFalse();
              const box = help!.getBoundingClientRect();
              expect(box.width > 0 && box.height > 0)
                .withContext(`${s.id}: the reason is actually on screen (${box.width}x${box.height})`).toBeTrue();
              expect(help!.textContent!.trim()).not.toBe('');
            }
          }
        });
      }
    });
  }

  it('the role is named in the reason, ahead of registration (registering cannot supply a role)', () => {
    signIn(session, { name: 'unregistered member', roles: ['user'], registered: false, matrix: false, mastodon: false, forum: false });
    const reason = (id: ServiceId) => menu.navEntries.find((e) => e.testid === `nav-${id}`)!.disabledReason();
    expect(reason('matrix')).toContain('Matrix member');
    expect(reason('mastodon')).toContain('Mastodon member');
    expect(reason('forum')).toContain('forum member');
    expect(cards.cards().find((c) => c.id === 'matrix')!.disabledReason).toContain('Matrix member');

    signIn(session, { name: 'role, unregistered', roles: ['matrix', 'user'], registered: false, matrix: false, mastodon: false, forum: false });
    expect(reason('matrix')).toContain('Complete your registration');
    expect(cards.cards().find((c) => c.id === 'matrix')!.state).toBe('registration');
  });
});

// ---------------------------------------------------------------------------
// Through the REAL route table: a refused session never asks for the remote.
// ---------------------------------------------------------------------------

@Component({
  selector: 'hug-test-home',
  imports: [DeniedNoticeComponent],
  template: `<p data-testid="stub-home">home</p><hug-denied-notice />`,
})
class StubHomeComponent {}

@Component({ selector: 'hug-test-remote', template: `<p data-testid="stub-remote">remote</p>` })
class StubRemoteComponent {}

const REMOTE_CHILDREN: Routes = [{ path: '**', component: StubRemoteComponent }];

describe('social mounts through the real route table (GUI-07)', () => {
  let session: SessionService;
  let router: Router;
  let harness: RouterTestingHarness;
  let load: jasmine.Spy;

  beforeEach(async () => {
    localStorage.clear();
    spyOn(window, 'fetch').and.rejectWith(new Error('offline in unit tests'));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes.map((r: Route) => (r.path === 'home' ? { path: 'home', component: StubHomeComponent } : r))),
        provideLocationMocks(),
      ],
    });
    load = spyOn(federationLoader, 'load').and.callFake(async () =>
      Object.fromEntries(REMOTE_ROUTES.map((r) => [r.routesConst, REMOTE_CHILDREN])));
    session = TestBed.inject(SessionService);
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.removeItem('hug.session'));

  async function navigate(url: string): Promise<void> {
    await harness.navigateByUrl(url).catch(() => undefined);
    harness.detectChanges();
  }
  const notice = () => harness.routeNativeElement?.querySelector('[data-testid="denied-notice"]')?.textContent ?? null;
  const persona = (name: string) => PERSONAS.find((p) => p.name === name)!;

  it('e2e-user clicking into the Forum lands on the denied notice; the forum remoteEntry is never requested', async () => {
    signIn(session, persona('e2e-user'));
    await navigate('/user');
    load.calls.reset();
    await navigate('/social/forum');
    expect(load).withContext('no remote fetch for a refused session').not.toHaveBeenCalled();
    expect(router.url).toBe('/home?denied=%2Fsocial%2Fforum');
    expect(notice()).toContain('The forums was not available.');
  });

  for (const name of ['e2e-user', 'e2e-mod', 'e2e-admin', 'e2e-superadmin']) {
    it(`${name} is refused Matrix and Mastodon before either remote loads (the hsproxy would 403 them)`, async () => {
      signIn(session, persona(name));
      await navigate('/social/matrix/rooms');
      expect(router.url).toBe('/home?denied=%2Fsocial%2Fmatrix%2Frooms');
      expect(notice()).toContain('The Matrix chat was not available.');
      await navigate('/social/mastodon');
      expect(router.url).toBe('/home?denied=%2Fsocial%2Fmastodon');
      expect(notice()).toContain('The Mastodon timeline was not available.');
      expect(load.calls.allArgs().filter(([remote]) => remote === 'matrix' || remote === 'mastodon'))
        .withContext('neither social remote was requested').toEqual([]);
    });
  }

  it('the role holders still mount their remote (the guard is not over-tight)', async () => {
    signIn(session, persona('e2e-matrix'));
    await navigate('/social/matrix');
    expect(router.url).toBe('/social/matrix');
    expect(load).toHaveBeenCalledWith('matrix', './routes');

    signIn(session, persona('e2e-mastodon'));
    await navigate('/social/mastodon');
    expect(router.url).toBe('/social/mastodon');
    expect(load).toHaveBeenCalledWith('mastodon', './routes');

    signIn(session, persona('e2e-forum'));
    await navigate('/social/forum');
    expect(router.url).toBe('/social/forum');
    expect(load).toHaveBeenCalledWith('forum', './routes');
  });

  it('an admin reaches the Forum through the gateway bypass, so the shell admits them too', async () => {
    signIn(session, persona('e2e-admin'));
    await navigate('/social/forum');
    expect(router.url).toBe('/social/forum');
    expect(load).toHaveBeenCalledWith('forum', './routes');
  });

  it('character-studio stays registration-only (a plain registered member is admitted)', async () => {
    signIn(session, persona('e2e-user'));
    await navigate('/character-studio');
    expect(router.url).toBe('/character-studio');
    expect(load).toHaveBeenCalledWith('character-studio', './routes');
  });
});
