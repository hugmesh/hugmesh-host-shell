import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { HeaderControlsComponent } from './header-controls.component';
import { SessionService } from '../session.service';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { MENU_BAR_MODE_KEY } from '../menu/menu-bar-mode.service';

/**
 * THE CHROME HELP-BUBBLE REVEAL CONTRACT, at the controls' new home.
 *
 * Sibling of menu.chrome-help-reveal.spec.ts, which pins the same contract for
 * the controls that stayed in the menubar (reload, auto-mode dismiss). These
 * three moved to the header banner (issue #19 comment, 2026-08-19):
 * the background-animation toggle, the menubar-mode toggle and the profile
 * trigger.
 *
 * Two of them had never been covered by a reveal spec at all — they were
 * `position: fixed` chrome in app.component.html, outside every menubar
 * fixture — which is precisely how `.bg-toggle__help` shipped revealed but
 * WIDTHLESS and painted as a 32px x 657px column of vertical text on the live
 * site. Moving them into a component fixture is what makes the contract
 * assertable for them at all.
 *
 * Each help span must:
 *   1. stay wired to its control via aria-describedby and keep its text,
 *   2. never be display:none (accname resolves through visibility:hidden, not
 *      through a node that was never laid out),
 *   3. be invisible AT REST, and out of flow so it cannot squat banner space,
 *   4. come back on keyboard focus, and
 *   5. read as a wide bubble rather than a ribbon squeezed to its icon anchor.
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

describe('HeaderControlsComponent — chrome help bubbles are revealed, not resident', () => {
  let fixture: ComponentFixture<HeaderControlsComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.removeItem(MENU_BAR_MODE_KEY);
    await TestBed.configureTestingModule({
      imports: [HeaderControlsComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: new SessionStub() },
        { provide: BellNotificationsService, useValue: new BellStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderControlsComponent);
    // The animation toggle only renders once a backdrop has been handed down.
    const paused = signal(false);
    fixture.componentRef.setInput('background', {
      paused: () => paused(),
      toggle: () => paused.update((v) => !v),
    });
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));

  function find(testid: string): HTMLElement {
    const node = el.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
    expect(node)
      .withContext(`[data-testid="${testid}"] must render for this contract to mean anything`)
      .toBeTruthy();
    return node!;
  }

  async function assertRevealContract(controlId: string, helpId: string): Promise<void> {
    const control = find(controlId);
    const help = find(helpId);

    expect(control.getAttribute('aria-describedby'))
      .withContext(`${controlId} must describe itself by ${helpId}`)
      .toBe(help.id);
    expect(help.textContent?.trim().length)
      .withContext(`${helpId} must still carry its text`)
      .toBeGreaterThan(0);

    const rest = getComputedStyle(help);

    expect(rest.display)
      .withContext(`${helpId} must not be display:none — that is not the reveal idiom`)
      .not.toBe('none');
    expect(rest.visibility)
      .withContext(`${helpId} paints in the banner at rest — it must be a revealed bubble`)
      .toBe('hidden');
    expect(rest.opacity)
      .withContext(`${helpId} is opaque at rest — it must be a revealed bubble`)
      .toBe('0');
    expect(['absolute', 'fixed'])
      .withContext(`${helpId} is in normal flow (position: ${rest.position}) and takes banner space`)
      .toContain(rest.position);

    control.focus();
    expect(document.activeElement)
      .withContext('the control must actually take focus for the reveal to be testable')
      .toBe(control);
    // The bubble fades in over $transition-base, so read it after the fade.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const focused = getComputedStyle(help);
    expect(focused.visibility)
      .withContext(`${helpId} must become visible while ${controlId} has focus`)
      .toBe('visible');
    expect(focused.opacity)
      .withContext(`${helpId} must become opaque while ${controlId} has focus`)
      .toBe('1');

    // …and it reads as a BUBBLE, not a ribbon. This is the assertion the live
    // 32x657 bg-toggle bubble would have failed.
    const bubble = help.getBoundingClientRect();
    const anchor = control.getBoundingClientRect();
    expect(bubble.width)
      .withContext(
        `${helpId} is ${Math.round(bubble.width)}x${Math.round(bubble.height)} — ` +
          'squeezed to its anchor instead of sizing to its text',
      )
      .toBeGreaterThan(anchor.width);
  }

  it('background toggle: help is a focus-revealed bubble, not resident banner text', async () => {
    await assertRevealContract('bg-toggle', 'bg-toggle-help');
  });

  it('menubar-mode toggle: help is a focus-revealed bubble, not resident banner text', async () => {
    await assertRevealContract('menubar-mode-toggle', 'menubar-mode-help');
  });

  it('profile trigger: the consumer that already conformed keeps conforming', async () => {
    await assertRevealContract('profile-trigger', 'profile-trigger-help');
  });

  /**
   * The idiom itself, not one consumer of it. EVERY `.field-help` sitting in the
   * banner's horizontal run must be a hidden bubble; the only resident help in
   * this component is inside the OPEN profile dropdown, which is a stacked list.
   */
  it('no .field-help is left painting inline inside the banner', () => {
    const offenders: string[] = [];
    for (const help of Array.from(el.querySelectorAll<HTMLElement>('.field-help'))) {
      if (help.closest('.profile-menu__list')) continue; // deliberately resident
      const cs = getComputedStyle(help);
      if (cs.visibility !== 'hidden' && cs.opacity !== '0') {
        offenders.push(
          `${help.getAttribute('data-testid') ?? help.id ?? help.className}` +
            ` (visibility:${cs.visibility} opacity:${cs.opacity} position:${cs.position})`,
        );
      }
    }
    expect(offenders)
      .withContext('these help spans paint as permanent inline text in the header banner')
      .toEqual([]);
  });
});
