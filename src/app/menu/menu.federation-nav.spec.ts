import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { MenuComponent } from './menu.component';
import { SessionService } from '../session.service';

/** Drives the menu's session-aware federation region. Backed by signals so the
 *  component's computed visibleFederationItems() reacts like the real service. */
class SessionStub {
  loggedIn = signal(false);
  fullyRegistered = signal(false);
  isAdmin = signal(false);
  isMod = signal(false);
  session = signal<{ label: string } | null>(null);
  cleared = false;
  clear() { this.cleared = true; }
}

describe('MenuComponent federation nav (role-aware)', () => {
  let fixture: ComponentFixture<MenuComponent>;
  let stub: SessionStub;
  let el: HTMLElement;

  beforeEach(async () => {
    stub = new SessionStub();
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: stub }],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    el = fixture.nativeElement as HTMLElement;
  });

  const has = (testid: string) => !!el.querySelector(`[data-testid="${testid}"]`);

  it('anonymous: shows Sign in, hides every federation entry + Sign out', () => {
    stub.loggedIn.set(false);
    fixture.detectChanges();
    expect(has('nav-login')).withContext('Sign in shown').toBeTrue();
    expect(has('nav-logout')).toBeFalse();
    expect(has('nav-matrix')).toBeFalse();
    expect(has('nav-admin')).toBeFalse();
    expect(has('nav-mod')).toBeFalse();
  });

  it('registered ROLE_USER: shows Matrix + Mastodon + Sign out, not Admin/Mod', () => {
    stub.loggedIn.set(true);
    stub.fullyRegistered.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    expect(has('nav-matrix')).toBeTrue();
    expect(has('nav-mastodon')).toBeTrue();
    expect(has('nav-logout')).toBeTrue();
    expect(has('nav-login')).toBeFalse();
    expect(has('nav-admin')).toBeFalse();
    expect(has('nav-mod')).toBeFalse();
  });

  it('logged in but unregistered: Matrix/Mastodon stay hidden', () => {
    stub.loggedIn.set(true);
    stub.fullyRegistered.set(false);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    expect(has('nav-matrix')).toBeFalse();
    expect(has('nav-mastodon')).toBeFalse();
  });

  it('ROLE_ADMIN: shows the Admin link', () => {
    stub.loggedIn.set(true);
    stub.isAdmin.set(true);
    stub.session.set({ label: 'root' });
    fixture.detectChanges();
    expect(has('nav-admin')).toBeTrue();
  });

  it('ROLE_MOD: shows the Mod (TODO) link only for moderators', () => {
    stub.loggedIn.set(true);
    stub.isMod.set(true);
    stub.session.set({ label: 'mod-user' });
    fixture.detectChanges();
    const mod = el.querySelector('[data-testid="nav-mod"]');
    expect(mod).withContext('Mod link present for moderator').toBeTruthy();
    expect(mod?.textContent).toContain('TODO');
  });

  it('Sign out clears the session and navigates home', () => {
    stub.loggedIn.set(true);
    stub.session.set({ label: 'alice' });
    fixture.detectChanges();
    const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    (el.querySelector('[data-testid="nav-logout"]') as HTMLButtonElement).click();
    expect(stub.cleared).withContext('session cleared').toBeTrue();
    expect(navSpy).toHaveBeenCalledWith('/');
  });
});
