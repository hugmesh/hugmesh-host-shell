import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LandingComponent } from './landing.component';
import { SessionService } from '../session.service';

/** SessionService double backed by signals so the component's computed
 *  visibleLinks() reacts exactly as it would against the real service. */
class SessionStub {
  loggedIn = signal(false);
  fullyRegistered = signal(false);
  isAdmin = signal(false);
  isMod = signal(false);
  session = signal<{ label: string } | null>(null);
}

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  let stub: SessionStub;
  let el: HTMLElement;

  beforeEach(async () => {
    stub = new SessionStub();
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: stub }],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    el = fixture.nativeElement as HTMLElement;
  });

  function cardRoutes(): string[] {
    return Array.from(el.querySelectorAll('a.landing-card')).map(
      (a) => a.getAttribute('data-testid') ?? '',
    );
  }

  it('anonymous: shows the public welcome + Sign in CTA, no service cards', () => {
    stub.loggedIn.set(false);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="welcome"]')).withContext('public welcome').toBeTruthy();
    expect(el.querySelector('[data-testid="signin-cta"]')).withContext('sign in CTA').toBeTruthy();
    expect(el.querySelectorAll('a.landing-card').length).toBe(0);
  });

  it('ROLE_USER (registered): links into BOTH the matrix and mastodon remotes', () => {
    stub.loggedIn.set(true);
    stub.fullyRegistered.set(true);
    stub.session.set({ label: 'alice@gmail.com' });
    fixture.detectChanges();
    const routes = cardRoutes();
    expect(routes).toContain('card-/social/matrix');
    expect(routes).toContain('card-/social/mastodon');
    expect(routes).not.toContain('card-/admin');
    expect(routes).not.toContain('card-/mod');
  });

  it('logged in but NOT registered: no social cards, prompts to complete registration', () => {
    stub.loggedIn.set(true);
    stub.fullyRegistered.set(false);
    stub.session.set({ label: 'alice@gmail.com' });
    fixture.detectChanges();
    expect(cardRoutes()).not.toContain('card-/social/matrix');
    expect(el.querySelector('[data-testid="complete-registration"]'))
      .withContext('registration prompt shown')
      .toBeTruthy();
  });

  it('ROLE_ADMIN: also surfaces the Admin card', () => {
    stub.loggedIn.set(true);
    stub.fullyRegistered.set(true);
    stub.isAdmin.set(true);
    stub.session.set({ label: 'root' });
    fixture.detectChanges();
    expect(cardRoutes()).toContain('card-/admin');
  });

  it('ROLE_MOD: surfaces the Mod card pointing at the /mod placeholder route', () => {
    stub.loggedIn.set(true);
    stub.isMod.set(true);
    stub.session.set({ label: 'mod-user' });
    fixture.detectChanges();
    expect(cardRoutes()).toContain('card-/mod');
  });
});
