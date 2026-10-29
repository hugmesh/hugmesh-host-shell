import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MenuComponent } from './menu.component';
import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { ViewReloadService } from '../view-reload.service';

/**
 * The shell RELOAD control lives in the chrome (the account region of the
 * menubar), NOT per-remote — one control that refreshes whatever the outlet is
 * showing. These specs pin the three properties that make it usable rather than
 * merely present: it is a real focusable button, it carries an accessible name +
 * description, and it is reachable for an ANONYMOUS session too (a wedged login
 * view is exactly when you need it most).
 *
 * NOTE: this is a SEPARATE spec file from menu.component.spec.ts on purpose —
 * that file's SessionStub predates `session.isUser()` (added with the Forum nav
 * entry) and every one of its specs currently dies rendering the menubar. The
 * stub here is complete, so these assertions are not riding on that breakage.
 */
class CompleteSessionStub {
  loggedIn = signal(false);
  fullyRegistered = signal(false);
  isUser = () => this.loggedIn();
  isAdmin = () => false;
  isMod = () => false;
  isSuperadmin = () => false;
  isGames = () => false;
  isGamesAdmin = () => false;
  session = signal<{ label: string } | null>(null);
  hasRole(_role: string) { return false; }
  clear() { /* not exercised here */ }
}

describe('MenuComponent — shell reload control', () => {
  let fixture: ComponentFixture<MenuComponent>;
  let el: HTMLElement;
  let session: CompleteSessionStub;
  let reload: ViewReloadService;

  beforeEach(async () => {
    session = new CompleteSessionStub();
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: session },
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    reload = TestBed.inject(ViewReloadService);
  });

  function button(): HTMLButtonElement | null {
    return el.querySelector<HTMLButtonElement>('[data-testid="view-reload"]');
  }

  it('renders for an ANONYMOUS session (not gated on login)', () => {
    expect(session.loggedIn()).toBeFalse();
    expect(el.querySelector('[data-testid="view-reload"]')).toBeTruthy();
  });

  it('is the control that STAYED in the bar when the header cluster was carved out', () => {
    // Reload is a view ACTION on whatever the outlet is showing, so it belongs
    // with the nav; the animation/menu toggles, the bell and the user menu are
    // account/shell chrome and moved to the header banner (issue #19 comment,
    // 2026-08-19). This asserts the boundary, so a future tidy-up cannot quietly
    // sweep reload out of the bar — or sweep a header control back into it.
    expect(el.querySelector('[data-testid="view-reload"]')).toBeTruthy();
    expect(el.querySelector('.bell-btn')).withContext('bell is the header\'s').toBeNull();
    expect(el.querySelector('[data-testid="bg-toggle"]'))
      .withContext('animation toggle is the header\'s')
      .toBeNull();
    expect(el.querySelector('[data-testid="menubar-mode-toggle"]'))
      .withContext('menu toggle is the header\'s')
      .toBeNull();
  });

  it('is a real <button> (keyboard reachable, native Enter/Space activation)', () => {
    const btn = button()!;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    // No tabindex override — it keeps its natural document-order tab stop.
    expect(btn.hasAttribute('tabindex')).toBeFalse();
  });

  it('carries an accessible NAME and a described-by explanation for the icon-only glyph', () => {
    const btn = button()!;
    expect(btn.getAttribute('aria-label')).toBe('Reload the current view');
    const helpId = btn.getAttribute('aria-describedby');
    expect(helpId).toBe('view-reload-help');
    const help = el.querySelector(`#${helpId}`);
    expect(help?.textContent?.trim()).toContain('Reload the current view');
    // The glyph itself must be hidden from the a11y tree or it double-announces.
    expect(btn.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('activating it asks the ViewReloadService to reload', () => {
    const spy = spyOn(reload, 'reload').and.resolveTo();
    button()!.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reflects the in-flight state as aria-busy + disabled', () => {
    reload.busy.set(true);
    fixture.detectChanges();

    const btn = button()!;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBeTrue();
    expect(el.querySelector('[data-testid="view-reload-help"]')?.textContent)
      .toContain('Reloading');
  });
});
