import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { HeaderControlsComponent } from './header-controls.component';
import { SessionService } from '../session.service';
import { ProfileModalService } from '../profile-modal/profile-modal.service';
import { BellNotificationsService } from '../bell/bell-notifications.service';

/**
 * THE USER (PROFILE) MENU — role-aware contents, activation, and sign-out.
 *
 * This suite used to mount MenuComponent: the account region lived in the
 * menubar. The operator moved it to the header banner (issue #19 comment
 * 2026-08-19 — "the notification bell and user menu belong in the title at the
 * top on the right, not in the menu"), so the same assertions now mount
 * HeaderControlsComponent. The coverage is deliberately CARRIED OVER rather than
 * rewritten: the move must not quietly cost a role gate.
 *
 * The anonymous "Sign in" ENTRY did NOT move — it is a navigation destination,
 * not an account control, and stays in the menubar (menu.component.spec.ts's
 * login-page chrome gate suite still owns it).
 */

/** Drives the session-aware account region. Backed by signals so the component's
 *  computed visibleProfileItems() reacts like the real service. */
class SessionStub {
  loggedIn = signal(false);
  fullyRegistered = signal(false);
  // Mirrors SessionService.isUser (session.service.ts:114) — see the note in
  // menu.component.spec.ts. Derived from loggedIn so it cannot drift.
  isUser = computed(() => this.loggedIn());
  isAdmin = signal(false);
  isMod = signal(false);
  isSuperadmin = signal(false);
  isGames = signal(false);
  isGamesAdmin = signal(false);
  roles = signal<string[]>([]);
  session = signal<{ label: string } | null>(null);
  cleared = false;
  hasRole(role: string) { return this.roles().some((r) => r.toLowerCase() === role.toLowerCase()); }
  // ASYNC, mirroring the real SessionService.clear(): it awaits POST /bff/sessionOut so the
  // server session is expired before anything can re-read it.
  async clear() { this.cleared = true; this.loggedIn.set(false); this.session.set(null); }
}

class BellStub {
  readonly unreadCount$ = of(0);
  startPolling = jasmine.createSpy('startPolling');
  stopPolling = jasmine.createSpy('stopPolling');
}

describe('HeaderControlsComponent — user menu (role-aware)', () => {
  let component: HeaderControlsComponent;
  let fixture: ComponentFixture<HeaderControlsComponent>;
  let stub: SessionStub;
  let modal: ProfileModalService;
  let el: HTMLElement;

  beforeEach(async () => {
    stub = new SessionStub();
    await TestBed.configureTestingModule({
      imports: [HeaderControlsComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: stub },
        { provide: BellNotificationsService, useValue: new BellStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderControlsComponent);
    component = fixture.componentInstance;
    modal = TestBed.inject(ProfileModalService);
    el = fixture.nativeElement as HTMLElement;
  });

  const has = (testid: string) => !!el.querySelector(`[data-testid="${testid}"]`);
  function openProfile(): void {
    (el.querySelector('[data-testid="profile-trigger"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('anonymous: renders no account controls at all', () => {
    stub.loggedIn.set(false);
    fixture.detectChanges();
    expect(has('profile-trigger')).toBeFalse();
    expect(el.querySelector('.bell-btn')).withContext('no bell either').toBeNull();
    // The anonymous Sign-in ENTRY is the menubar's, not this component's — it is a
    // navigation destination, not an account control.
    expect(has('nav-login')).toBeFalse();
  });

  it('authenticated: shows the profile trigger labelled with the user', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    expect(has('profile-trigger')).toBeTrue();
    expect(el.querySelector('[data-testid="nav-user"]')?.textContent?.trim()).toBe('alice');
  });

  it('the profile trigger is a closed aria-haspopup=menu button until clicked', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    const trigger = el.querySelector('[data-testid="profile-trigger"]')!;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[role="menu"]')).withContext('menu hidden until opened').toBeNull();
  });

  it('opening the profile menu reveals Profile + Sign out (role=menu)', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    openProfile();
    expect(el.querySelector('[role="menu"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="profile-trigger"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(has('menu-profile')).toBeTrue();
    expect(has('menu-logout')).toBeTrue();
  });

  it('plain user: the profile menu hides Admin, Moderation, Wiki, Owncast, and Tube', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    openProfile();
    expect(has('menu-admin')).toBeFalse();
    expect(has('menu-apidocs')).toBeFalse();
    expect(has('menu-mod')).toBeFalse();
    expect(has('menu-wiki')).toBeFalse();
    expect(has('menu-owncast')).toBeFalse();
    expect(has('menu-tube')).toBeFalse();
  });

  it('ROLE_ADMIN: the profile menu shows the Admin entry', () => {
    stub.loggedIn.set(true);
    stub.isAdmin.set(true);
    stub.session.set({ label: 'root' });
    fixture.detectChanges();
    openProfile();
    expect(has('menu-admin')).toBeTrue();
  });

  it('ROLE_ADMIN: the profile menu shows the API docs entry (admin-only)', () => {
    stub.loggedIn.set(true);
    stub.isAdmin.set(true);
    stub.session.set({ label: 'root' });
    fixture.detectChanges();
    openProfile();
    const apidocs = el.querySelector('[data-testid="menu-apidocs"]') as HTMLElement;
    expect(apidocs).withContext('API docs entry visible for admins').toBeTruthy();
    expect(apidocs.textContent?.trim()).withContext('accessible name').toBe('API docs');
    expect(apidocs.getAttribute('role')).withContext('WAI-ARIA menuitem').toBe('menuitem');
  });

  it('plain user: the profile menu hides the API docs entry', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    openProfile();
    expect(has('menu-apidocs')).toBeFalse();
  });

  it('ROLE_MOD: a moderator (non-admin) does not see the API docs entry', () => {
    stub.loggedIn.set(true);
    stub.isMod.set(true);
    stub.session.set({ label: 'mod-user' });
    fixture.detectChanges();
    openProfile();
    expect(has('menu-apidocs')).toBeFalse();
  });

  it('API docs entry navigates to /admin/docs and closes the menu', () => {
    stub.loggedIn.set(true);
    stub.isAdmin.set(true);
    stub.session.set({ label: 'root' });
    fixture.detectChanges();
    const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    openProfile();
    (el.querySelector('[data-testid="menu-apidocs"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(navSpy).toHaveBeenCalledWith('/admin/docs');
    expect(component.profileOpen()).toBeFalse();
  });

  it('ROLE_MOD: the profile menu shows the Moderation entry only for moderators', () => {
    stub.loggedIn.set(true);
    stub.isMod.set(true);
    stub.session.set({ label: 'mod-user' });
    fixture.detectChanges();
    openProfile();
    expect(has('menu-mod')).toBeTrue();
    expect(has('menu-admin')).toBeFalse();
  });

  describe('Wiki management entry (role-gated: admin | superadmin | mod+ROLE_WIKI)', () => {
    function login(over: Partial<{ admin: boolean; superadmin: boolean; mod: boolean; roles: string[] }> = {}) {
      stub.loggedIn.set(true);
      stub.session.set({ label: 'user' });
      stub.isAdmin.set(over.admin ?? false);
      stub.isSuperadmin.set(over.superadmin ?? false);
      stub.isMod.set(over.mod ?? false);
      stub.roles.set(over.roles ?? []);
      fixture.detectChanges();
    }

    it('SHOWN for an admin', () => {
      login({ admin: true });
      openProfile();
      expect(has('menu-wiki')).toBeTrue();
    });

    it('SHOWN for a superadmin', () => {
      login({ superadmin: true });
      openProfile();
      expect(has('menu-wiki')).toBeTrue();
    });

    it('SHOWN for a moderator granted ROLE_WIKI', () => {
      login({ mod: true, roles: ['mod', 'wiki'] });
      openProfile();
      const wiki = el.querySelector('[data-testid="menu-wiki"]') as HTMLElement;
      expect(wiki).withContext('Wiki entry visible for mod+ROLE_WIKI').toBeTruthy();
      expect(wiki.textContent?.trim()).withContext('accessible name').toBe('Wiki');
      expect(wiki.getAttribute('role')).withContext('WAI-ARIA menuitem').toBe('menuitem');
    });

    it('HIDDEN for a bare moderator WITHOUT ROLE_WIKI', () => {
      login({ mod: true, roles: ['mod'] });
      openProfile();
      expect(has('menu-wiki')).toBeFalse();
    });

    it('HIDDEN for a plain user', () => {
      login();
      openProfile();
      expect(has('menu-wiki')).toBeFalse();
    });

    it('navigates to /wiki and closes the menu', () => {
      login({ admin: true });
      const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
      openProfile();
      (el.querySelector('[data-testid="menu-wiki"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(navSpy).toHaveBeenCalledWith('/wiki');
      expect(component.profileOpen()).toBeFalse();
    });
  });

  describe('Owncast management entry (role-gated: ROLE_OWNCAST | admin | superadmin | mod)', () => {
    function login(over: Partial<{ admin: boolean; superadmin: boolean; mod: boolean; roles: string[] }> = {}) {
      stub.loggedIn.set(true);
      stub.session.set({ label: 'user' });
      stub.isAdmin.set(over.admin ?? false);
      stub.isSuperadmin.set(over.superadmin ?? false);
      stub.isMod.set(over.mod ?? false);
      stub.roles.set(over.roles ?? []);
      fixture.detectChanges();
    }

    it('SHOWN for a streamer granted ROLE_OWNCAST', () => {
      login({ roles: ['user', 'owncast'] });
      openProfile();
      const owncast = el.querySelector('[data-testid="menu-owncast"]') as HTMLElement;
      expect(owncast).withContext('Owncast entry visible for ROLE_OWNCAST').toBeTruthy();
      expect(owncast.textContent?.trim()).withContext('accessible name').toBe('Owncast');
      expect(owncast.getAttribute('role')).withContext('WAI-ARIA menuitem').toBe('menuitem');
    });

    it('SHOWN for an admin (grant management)', () => {
      login({ admin: true });
      openProfile();
      expect(has('menu-owncast')).toBeTrue();
    });

    it('SHOWN for a superadmin', () => {
      login({ superadmin: true });
      openProfile();
      expect(has('menu-owncast')).toBeTrue();
    });

    it('SHOWN for a moderator (stream moderation)', () => {
      login({ mod: true, roles: ['mod'] });
      openProfile();
      expect(has('menu-owncast')).toBeTrue();
    });

    it('HIDDEN for a plain user WITHOUT ROLE_OWNCAST', () => {
      login({ roles: ['user'] });
      openProfile();
      expect(has('menu-owncast')).toBeFalse();
    });

    it('navigates to /owncast and closes the menu', () => {
      login({ roles: ['user', 'owncast'] });
      const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
      openProfile();
      (el.querySelector('[data-testid="menu-owncast"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(navSpy).toHaveBeenCalledWith('/owncast');
      expect(component.profileOpen()).toBeFalse();
    });
  });

  describe('Tube management entry (role-gated: ROLE_TUBE | admin | superadmin)', () => {
    function login(over: Partial<{ admin: boolean; superadmin: boolean; mod: boolean; roles: string[] }> = {}) {
      stub.loggedIn.set(true);
      stub.session.set({ label: 'user' });
      stub.isAdmin.set(over.admin ?? false);
      stub.isSuperadmin.set(over.superadmin ?? false);
      stub.isMod.set(over.mod ?? false);
      stub.roles.set(over.roles ?? []);
      fixture.detectChanges();
    }

    it('SHOWN for a user granted ROLE_TUBE', () => {
      login({ roles: ['user', 'tube'] });
      openProfile();
      const tube = el.querySelector('[data-testid="menu-tube"]') as HTMLElement;
      expect(tube).withContext('Tube entry visible for ROLE_TUBE').toBeTruthy();
      expect(tube.textContent?.trim()).withContext('accessible name').toBe('Tube');
      expect(tube.getAttribute('role')).withContext('WAI-ARIA menuitem').toBe('menuitem');
    });

    it('SHOWN for an admin (quota/retention management)', () => {
      login({ admin: true });
      openProfile();
      expect(has('menu-tube')).toBeTrue();
    });

    it('SHOWN for a superadmin', () => {
      login({ superadmin: true });
      openProfile();
      expect(has('menu-tube')).toBeTrue();
    });

    it('HIDDEN for a plain user WITHOUT ROLE_TUBE', () => {
      login({ roles: ['user'] });
      openProfile();
      expect(has('menu-tube')).toBeFalse();
    });

    it('HIDDEN for a bare moderator WITHOUT ROLE_TUBE', () => {
      login({ mod: true, roles: ['mod'] });
      openProfile();
      expect(has('menu-tube')).toBeFalse();
    });

    it('navigates to /tube and closes the menu', () => {
      login({ roles: ['user', 'tube'] });
      const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
      openProfile();
      (el.querySelector('[data-testid="menu-tube"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(navSpy).toHaveBeenCalledWith('/tube');
      expect(component.profileOpen()).toBeFalse();
    });
  });

  describe('Games Admin management entry (role-gated: DERIVED ROLE_GAMES_ADMIN | superadmin)', () => {
    function login(over: Partial<{ admin: boolean; superadmin: boolean; mod: boolean; gamesAdmin: boolean; roles: string[] }> = {}) {
      stub.loggedIn.set(true);
      stub.session.set({ label: 'user' });
      stub.isAdmin.set(over.admin ?? false);
      stub.isSuperadmin.set(over.superadmin ?? false);
      stub.isMod.set(over.mod ?? false);
      stub.isGamesAdmin.set(over.gamesAdmin ?? false);
      stub.roles.set(over.roles ?? []);
      fixture.detectChanges();
    }

    it('SHOWN for the derived games-admin tier (e2e-gamesadmin)', () => {
      login({ gamesAdmin: true, roles: ['user', 'games', 'admin'] });
      openProfile();
      const gamesAdmin = el.querySelector('[data-testid="menu-games-admin"]') as HTMLElement;
      expect(gamesAdmin).withContext('Games Admin entry visible for the derived tier').toBeTruthy();
      expect(gamesAdmin.textContent?.trim()).withContext('accessible name').toBe('Games Admin');
      expect(gamesAdmin.getAttribute('role')).withContext('WAI-ARIA menuitem').toBe('menuitem');
    });

    it('SHOWN for a superadmin', () => {
      login({ superadmin: true });
      openProfile();
      expect(has('menu-games-admin')).toBeTrue();
    });

    it('HIDDEN for a bare admin WITHOUT ROLE_GAMES (e2e-adminonly)', () => {
      login({ admin: true, roles: ['user', 'admin'] });
      openProfile();
      expect(has('menu-games-admin')).toBeFalse();
    });

    it('HIDDEN for a bare games member WITHOUT admin/mod (e2e-gamesonly)', () => {
      login({ roles: ['user', 'games'] });
      openProfile();
      expect(has('menu-games-admin')).toBeFalse();
    });

    it('HIDDEN for a plain user', () => {
      login();
      openProfile();
      expect(has('menu-games-admin')).toBeFalse();
    });

    it('navigates to /games/admin and closes the menu', () => {
      login({ gamesAdmin: true, roles: ['user', 'games', 'admin'] });
      const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
      openProfile();
      (el.querySelector('[data-testid="menu-games-admin"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(navSpy).toHaveBeenCalledWith('/games/admin');
      expect(component.profileOpen()).toBeFalse();
    });
  });

  it('Profile entry opens the host profile modal', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    openProfile();
    expect(modal.isOpen()).toBeFalse();
    (el.querySelector('[data-testid="menu-profile"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(modal.isOpen()).withContext('Profile opens the modal').toBeTrue();
  });

  it('Admin entry navigates to the admin role-home and closes the menu', () => {
    stub.loggedIn.set(true);
    stub.isAdmin.set(true);
    stub.session.set({ label: 'root' });
    fixture.detectChanges();
    const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    openProfile();
    (el.querySelector('[data-testid="menu-admin"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(navSpy).toHaveBeenCalledWith('/admin');
    expect(component.profileOpen()).toBeFalse();
  });

  it('Sign out clears the session and returns to the authgate at "/"', async () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    openProfile();
    (el.querySelector('[data-testid="menu-logout"]') as HTMLButtonElement).click();
    // logout() AWAITS the server sign-out before navigating, so the redirect lands a
    // microtask later. Ordering, not timing: the nav must not race the cookie expiry.
    await Promise.resolve();
    await Promise.resolve();
    expect(stub.cleared).withContext('session cleared').toBeTrue();
    expect(navSpy).toHaveBeenCalledWith('/');
  });

  it('Sign out expires the SERVER session BEFORE navigating', async () => {
    // Regression guard for the ordering: navigating first would run roleHomeGuard while the
    // cookie is still live, which is what let a "signed-out" user land back in their
    // role-home instead of the login screen.
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    const order: string[] = [];
    stub.clear = async () => { order.push('clear'); stub.cleared = true; stub.loggedIn.set(false); };
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.callFake(((): Promise<boolean> => {
      order.push('navigate');
      return Promise.resolve(true);
    }) as never);
    await component.logout();
    expect(order).toEqual(['clear', 'navigate']);
  });
});
