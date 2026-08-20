import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { HeaderComponent } from './header.component';
import { SessionService } from '../session.service';
import { BellNotificationsService } from '../bell/bell-notifications.service';

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
  readonly unreadCount$ = of(0);
  startPolling = jasmine.createSpy('startPolling');
  stopPolling = jasmine.createSpy('stopPolling');
}

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: new SessionStub() },
        { provide: BellNotificationsService, useValue: new BellStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render an h1 with the site name', () => {
    const h1 = el.querySelector('h1');
    expect(h1).withContext('h1 must be present').toBeTruthy();
    expect(h1!.textContent?.trim()).toBe('HugMesh');
  });

  it('h1 should have tabindex="-1" for programmatic focus', () => {
    const h1 = el.querySelector<HTMLHeadingElement>('h1');
    expect(h1?.getAttribute('tabindex')).toBe('-1');
  });

  it('host should carry the text-center class', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).toContain('text-center');
  });

  // ── The banner is the chrome controls' home now (issue #19, 2026-08-19) ────
  it('renders the chrome control cluster', () => {
    expect(el.querySelector('[data-testid="header-controls"]'))
      .withContext('the banner owns the shell chrome controls')
      .toBeTruthy();
  });

  it('lays the banner out so the controls can sit at the inline end without covering the title', () => {
    const cs = getComputedStyle(fixture.nativeElement as HTMLElement);
    expect(cs.display).withContext('banner is a flex row').toBe('flex');
    expect(cs.flexWrap)
      .withContext('controls must WRAP below the wordmark rather than overlap it when narrow')
      .toBe('wrap');
  });

  it('omits the background toggle when no backdrop was handed down', () => {
    // A pause button with nothing to pause is worse than no button: the input is
    // optional, and the toggle is gated on it rather than rendering inert.
    expect(el.querySelector('[data-testid="bg-toggle"]')).toBeNull();
  });

  it('renders the background toggle once a backdrop IS handed down', () => {
    const paused = signal(false);
    fixture.componentRef.setInput('background', {
      paused: () => paused(),
      toggle: () => paused.update((v) => !v),
    });
    fixture.detectChanges();

    const btn = el.querySelector<HTMLButtonElement>('[data-testid="bg-toggle"]');
    expect(btn).withContext('bg-toggle renders when it has something to drive').toBeTruthy();
    expect(btn!.getAttribute('aria-pressed')).toBe('false');
    btn!.click();
    fixture.detectChanges();
    expect(btn!.getAttribute('aria-pressed'))
      .withContext('the toggle drives the backdrop it was given')
      .toBe('true');
  });
});
