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

  it('mirrors the controls with an empty gutter so the wordmark is TRULY centred', () => {
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '900px';
    fixture.detectChanges();

    const bar = host.querySelector<HTMLElement>('.header__bar')!;
    const h1 = host.querySelector<HTMLHeadingElement>('h1')!;
    const barRect = bar.getBoundingClientRect();
    const h1Rect = h1.getBoundingClientRect();

    // The failure this pins: end-align the controls with no mirroring gutter and
    // the "centred" title silently shifts left by half the controls' width.
    const h1Centre = h1Rect.left + h1Rect.width / 2;
    const barCentre = barRect.left + barRect.width / 2;
    expect(Math.abs(h1Centre - barCentre))
      .withContext('the wordmark must sit on the banner midpoint, not left of it')
      .toBeLessThanOrEqual(2);
    host.style.width = '';
  });

  it('stacks the controls under the title at narrow widths instead of squeezing them', () => {
    const host = fixture.nativeElement as HTMLElement;
    // The banner is its own @container, so its OWN width decides the layout —
    // which is what makes the stacked rendering reachable from a unit test.
    host.style.width = '320px';
    fixture.detectChanges();

    const h1 = host.querySelector<HTMLHeadingElement>('h1')!.getBoundingClientRect();
    const controls = host
      .querySelector<HTMLElement>('[data-testid="header-controls"]')!
      .getBoundingClientRect();
    expect(controls.top)
      .withContext('at phone width the controls take a row of their own, below the wordmark')
      .toBeGreaterThanOrEqual(h1.bottom - 1);
    host.style.width = '';
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
