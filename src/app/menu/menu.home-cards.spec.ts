import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { MenuComponent } from './menu.component';
import { MENU_BAR_MODE_KEY } from './menu-bar-mode.service';
import { WORKLOAD_CAPABILITY_ENDPOINT } from './workload-console-probe.service';
import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { AnnouncementsService } from '../announcements/announcements.service';

/**
 * HOME SERVICE CARDS + CONSOLE SECTION SUBMENUS (issue #19, 2026-08-19 comment),
 * end to end through the template:
 *
 *  - on the signed-in HOME ('/user' — where roleHomeGuard lands everyone) the
 *    menubar hides and the SAME visible entries render as service CARDS;
 *  - everywhere else the bar renders and the cards do not;
 *  - while an admin/mod console is the ACTIVE route, its sections render as a
 *    SUBMENU nested under the bar — gated on the same predicates as the entry
 *    (and on the superadmin tier for the superadmin-only admin sections).
 *
 * Own spec file with its own TestBed (the menubar-mode / federation-nav
 * precedent) so the routing fixture never leaks into the keyboard suites. The
 * routes are COMPONENTLESS (children: []) so real router navigation works
 * without a RouterOutlet in the fixture — the same componentless-route idiom
 * app.routes.ts uses for the '' authgate.
 */

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
  hasRole(role: string) { return this.roles().some((r) => r.toLowerCase() === role.toLowerCase()); }
  async clear() { this.loggedIn.set(false); this.session.set(null); }
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

describe('MenuComponent — home service cards + console submenus (issue #19)', () => {
  let fixture: ComponentFixture<MenuComponent>;
  let session: SessionStub;
  let capabilities: CapabilitiesStub;
  let router: Router;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.removeItem(MENU_BAR_MODE_KEY);
    session = new SessionStub();
    capabilities = new CapabilitiesStub();

    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          // Componentless stand-ins for the real mounts, so navigateByUrl
          // resolves without an outlet. Child paths cover the "inside the
          // console" and "home vs its children" cases.
          { path: 'user', children: [{ path: 'notifications', children: [] }] },
          { path: 'home', children: [] },
          { path: 'about', children: [] },
          { path: 'social/mastodon', children: [] },
          {
            path: 'admin',
            children: [
              { path: 'usage', children: [] },
              { path: 'superadmin/domains', children: [] },
            ],
          },
          { path: 'mod', children: [{ path: 'console', children: [] }] },
        ]),
        { provide: SessionService, useValue: session },
        { provide: CapabilitiesService, useValue: capabilities },
        { provide: BellNotificationsService, useValue: new BellStub() },
        { provide: AnnouncementsService, useValue: new AnnouncementsStub() as unknown as AnnouncementsService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(MenuComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));

  async function goto(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture.detectChanges();
  }

  const navbar = () => el.querySelector('nav.navbar');
  const cardsNav = () => el.querySelector('[data-testid="home-services-nav"]');
  const byTestid = (id: string) => el.querySelector(`[data-testid="${id}"]`);
  const submenu = () => el.querySelector('[data-testid="nav-submenu"]');

  describe('home service cards (menu hidden on home, cards shown)', () => {
    it('on the /user home: the bar hides and the services render as cards', async () => {
      await goto('/user');
      expect(navbar()).withContext('the menubar hides on home').toBeNull();
      expect(cardsNav()).withContext('the service cards take its place').toBeTruthy();
    });

    it('the cards are exactly the menu-gated services — no Home card, no consoles for a plain member', async () => {
      await goto('/user');
      expect(byTestid('home-card-nav-mastodon')).toBeTruthy();
      expect(byTestid('home-card-nav-matrix')).toBeTruthy();
      expect(byTestid('home-card-nav-forum')).toBeTruthy();
      expect(byTestid('home-card-nav-home'))
        .withContext('Home never renders as a card — the cards are already home').toBeNull();
      expect(byTestid('home-card-nav-admin'))
        .withContext('a member without the role sees no admin card (same visible() gate as the bar)').toBeNull();
      expect(byTestid('home-card-nav-mod')).toBeNull();
    });

    it('the role-gated console cards appear for the roles that hold them', async () => {
      session.isAdmin.set(true);
      session.isMod.set(true);
      await goto('/user');
      expect(byTestid('home-card-nav-admin')).toBeTruthy();
      expect(byTestid('home-card-nav-mod')).toBeTruthy();
    });

    it('a plain member gets a DISABLED Games card with the games-member reason, and no Games Admin card', async () => {
      await goto('/user');
      const games = byTestid('home-card-nav-games') as HTMLElement;
      expect(games).withContext('Games is listed like every other service').toBeTruthy();
      expect(games.tagName).withContext('greyed, not a link').toBe('SPAN');
      expect(games.getAttribute('aria-disabled')).toBe('true');
      expect(byTestid('home-card-nav-games-help')?.textContent?.trim()).toBe('Sign in as a games member to open this.');
      expect(byTestid('home-card-nav-games-admin')).toBeNull();
    });

    it('a games member gets an ENABLED Games card linking to /games; the derived tier also gets Games Admin', async () => {
      session.isGames.set(true);
      await goto('/user');
      const games = byTestid('home-card-nav-games') as HTMLAnchorElement;
      expect(games.tagName).toBe('A');
      expect(games.getAttribute('href')).toBe('/games');
      expect(byTestid('home-card-nav-games-admin')).withContext('bare member: no console card').toBeNull();

      session.isMod.set(true);
      session.isGamesAdmin.set(true);
      fixture.detectChanges();
      const console = byTestid('home-card-nav-games-admin') as HTMLAnchorElement;
      expect(console).toBeTruthy();
      expect(console.getAttribute('href')).toBe('/games/admin');
    });

    it('an enabled card is a real link that navigates to its service', async () => {
      await goto('/user');
      const card = byTestid('home-card-nav-mastodon') as HTMLAnchorElement;
      expect(card.tagName).toBe('A');
      card.click();
      await fixture.whenStable();
      expect(router.url).toBe('/social/mastodon');
    });

    it('an unregistered session gets a DISABLED social card with the registration reason', async () => {
      session.fullyRegistered.set(false);
      await goto('/user');
      const card = byTestid('home-card-nav-mastodon')!;
      expect(card.tagName).withContext('disabled card is not a link').toBe('SPAN');
      expect(card.getAttribute('aria-disabled')).toBe('true');
      expect(byTestid('home-card-nav-mastodon-help')?.textContent)
        .toContain('Complete your registration');
      // Forum needs only an authenticated member (isUser), so it stays enabled.
      expect((byTestid('home-card-nav-forum') as HTMLElement).tagName).toBe('A');
    });

    it('an uninstalled service card is greyed with the deployment reason (grey + EXPLAIN, never hide)', async () => {
      capabilities.setAbsent('matrix');
      await goto('/user');
      const card = byTestid('home-card-nav-matrix')!;
      expect(card.getAttribute('aria-disabled')).toBe('true');
      expect(byTestid('home-card-nav-matrix-help')?.textContent)
        .toContain('not available on this deployment');
    });

    it('anonymous: the bar stays (Sign in must remain reachable) and no cards render', async () => {
      session.loggedIn.set(false);
      session.session.set(null);
      await goto('/user');
      expect(navbar()).withContext('an anonymous visitor keeps the bar').toBeTruthy();
      expect(byTestid('nav-login')).toBeTruthy();
      expect(cardsNav()).toBeNull();
    });

    it('the bar returns off-home: /user children and other pages render the bar, not cards', async () => {
      await goto('/user/notifications');
      expect(navbar()).withContext('/user/notifications is a destination, not the home').toBeTruthy();
      expect(cardsNav()).toBeNull();

      await goto('/about');
      expect(navbar()).toBeTruthy();
      expect(cardsNav()).toBeNull();
    });
  });

  describe('admin/mod console section submenus (active route only)', () => {
    beforeEach(() => {
      session.isAdmin.set(true);
      session.isMod.set(true);
    });

    it('no submenu while no console is the active route', async () => {
      await goto('/about');
      expect(navbar()).toBeTruthy();
      expect(byTestid('nav-admin')).withContext('the console entry itself stays top-level').toBeTruthy();
      expect(submenu()).toBeNull();
    });

    it('inside /admin: the admin sections render as a submenu under the admin entry', async () => {
      await goto('/admin');
      const sub = submenu();
      expect(sub).toBeTruthy();
      expect(sub!.getAttribute('data-for')).toBe('nav-admin');
      expect(sub!.getAttribute('aria-label')).toBe('Admin sections');
      const usage = byTestid('subnav-admin-usage') as HTMLAnchorElement;
      expect(usage).toBeTruthy();
      expect(usage.getAttribute('href')).toBe('/admin/usage');
    });

    it('the submenu stays while DEEPER inside the console, marking the current section', async () => {
      await goto('/admin/usage');
      expect(submenu()).toBeTruthy();
      const usage = byTestid('subnav-admin-usage')!;
      expect(usage.getAttribute('aria-current')).toBe('page');
    });

    it('superadmin-only sections are hidden from a plain admin', async () => {
      await goto('/admin');
      expect(byTestid('subnav-admin-domains')).toBeNull();
      expect(byTestid('subnav-admin-device-licenses')).toBeNull();
      expect(byTestid('subnav-admin-egress-vpn')).toBeNull();
    });

    it('superadmin-only sections appear for a superadmin', async () => {
      session.isSuperadmin.set(true);
      await goto('/admin');
      const domains = byTestid('subnav-admin-domains') as HTMLAnchorElement;
      expect(domains).toBeTruthy();
      expect(domains.getAttribute('href')).toBe('/admin/superadmin/domains');
    });

    describe('HIDDEN-tier workload console (server capability probe)', () => {
      const http = () => TestBed.inject(HttpTestingController);
      const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };

      it('stays dark until the probe answers, even for a superadmin', async () => {
        session.isSuperadmin.set(true);
        await goto('/admin');
        const req = http().expectOne(WORKLOAD_CAPABILITY_ENDPOINT);
        expect(req.request.method).toBe('GET');
        expect(byTestid('subnav-admin-workloads')).toBeNull();
        expect(el.textContent).not.toContain('Workload console');
        req.flush({ enabled: true });
        await settle();
      });

      it('stays dark when the server answers 404 (no grant, or the feature is off)', async () => {
        session.isSuperadmin.set(true);
        await goto('/admin');
        http().expectOne(WORKLOAD_CAPABILITY_ENDPOINT).flush('', { status: 404, statusText: 'Not Found' });
        await settle();
        expect(byTestid('subnav-admin-workloads')).toBeNull();
        expect(el.textContent).not.toContain('Workload console');
      });

      it('stays dark on a network failure', async () => {
        await goto('/admin');
        http().expectOne(WORKLOAD_CAPABILITY_ENDPOINT).error(new ProgressEvent('error'));
        await settle();
        expect(byTestid('subnav-admin-workloads')).toBeNull();
      });

      it('appears under the admin sections once the probe answers 200', async () => {
        await goto('/admin');
        http().expectOne(WORKLOAD_CAPABILITY_ENDPOINT).flush({ enabled: true, readOnly: true });
        await settle();
        const link = byTestid('subnav-admin-workloads') as HTMLAnchorElement;
        expect(link).toBeTruthy();
        expect(link.getAttribute('href')).toBe('/admin/workloads');
        expect(link.textContent).toContain('Workload console');
      });

      it('goes dark when the session stops being an admin and stays dark until a fresh probe answers', async () => {
        await goto('/admin');
        http().expectOne(WORKLOAD_CAPABILITY_ENDPOINT).flush({ enabled: true });
        await settle();
        expect(byTestid('subnav-admin-workloads')).toBeTruthy();

        session.isAdmin.set(false);
        fixture.detectChanges();
        await settle();
        session.isAdmin.set(true);
        fixture.detectChanges();
        await settle();
        const again = http().expectOne(WORKLOAD_CAPABILITY_ENDPOINT);
        expect(byTestid('subnav-admin-workloads'))
          .withContext('the earlier 200 must not outlive the earlier admin session').toBeNull();
        again.flush('', { status: 404, statusText: 'Not Found' });
        await settle();
        expect(byTestid('subnav-admin-workloads')).toBeNull();
      });

      it('is never probed for a session that is not an admin', async () => {
        session.isAdmin.set(false);
        await goto('/about');
        http().expectNone(WORKLOAD_CAPABILITY_ENDPOINT);
      });
    });

    it('inside /mod: the moderation sections render, and the admin ones do not', async () => {
      await goto('/mod/console');
      const sub = submenu();
      expect(sub).toBeTruthy();
      expect(sub!.getAttribute('data-for')).toBe('nav-mod');
      expect(byTestid('subnav-mod-console')).toBeTruthy();
      expect(byTestid('subnav-mod-findings')).toBeTruthy();
      expect(byTestid('subnav-admin-usage')).toBeNull();
    });

    it('a session that cannot see the console entry never sees its sections', async () => {
      session.isAdmin.set(false);
      session.isMod.set(false);
      await goto('/admin');
      expect(submenu()).withContext('sections follow the entry visibility gate').toBeNull();
    });
  });
});
