import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { MenuComponent } from './menu.component';
import { SessionService } from '../session.service';
import { ProfileModalService } from '../profile-modal/profile-modal.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';

/** Drives the menu's session-aware account region (Sign in vs the profile menu).
 *  Backed by signals so the component's computed visibleProfileItems() reacts
 *  like the real service. */
class SessionStub {
  loggedIn = signal(false);
  fullyRegistered = signal(false);
  isAdmin = signal(false);
  isMod = signal(false);
  isSuperadmin = signal(false);
  roles = signal<string[]>([]);
  session = signal<{ label: string } | null>(null);
  cleared = false;
  hasRole(role: string) { return this.roles().some((r) => r.toLowerCase() === role.toLowerCase()); }
  clear() { this.cleared = true; }
}

describe('MenuComponent account region + profile menu (role-aware)', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;
  let stub: SessionStub;
  let modal: ProfileModalService;
  let el: HTMLElement;

  beforeEach(async () => {
    stub = new SessionStub();
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: stub },
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;
    modal = TestBed.inject(ProfileModalService);
    el = fixture.nativeElement as HTMLElement;
  });

  const has = (testid: string) => !!el.querySelector(`[data-testid="${testid}"]`);
  function openProfile(): void {
    (el.querySelector('[data-testid="profile-trigger"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('anonymous: shows Sign in, hides the profile menu', () => {
    stub.loggedIn.set(false);
    fixture.detectChanges();
    expect(has('nav-login')).toBeTrue();
    expect(has('profile-trigger')).toBeFalse();
  });

  it('authenticated: shows the profile trigger labelled with the user, hides Sign in', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    expect(has('nav-login')).toBeFalse();
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

  it('plain user: the profile menu hides Admin, Moderation, and Wiki', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    openProfile();
    expect(has('menu-admin')).toBeFalse();
    expect(has('menu-apidocs')).toBeFalse();
    expect(has('menu-mod')).toBeFalse();
    expect(has('menu-wiki')).toBeFalse();
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

  it('Sign out clears the session and returns to the authgate at "/"', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    openProfile();
    (el.querySelector('[data-testid="menu-logout"]') as HTMLButtonElement).click();
    expect(stub.cleared).withContext('session cleared').toBeTrue();
    expect(navSpy).toHaveBeenCalledWith('/');
  });
});
