import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { MenuComponent } from './menu.component';
import { MENU_BAR_MODE_KEY, MenuBarModeService } from './menu-bar-mode.service';
import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { HomeAnnouncement } from '../announcements/announcement.model';

/**
 * THE CHROME HELP-BUBBLE REVEAL CONTRACT.
 *
 * Every icon-only control in the shell chrome pairs its glyph with a
 * `.field-help` span wired through `aria-describedby`. Those spans have TWO
 * obligations that pull against each other:
 *
 *   1. they must ALWAYS be in the accessibility tree (never `display: none`,
 *      never `.sr-only`-swapped-out), because the glyph carries no text; and
 *   2. they must NOT be painted at rest — the bar is horizontal chrome, and a
 *      sentence of body text sitting between two icons squats the space the
 *      navigation entries need.
 *
 * `.bg-toggle__help` and `.profile-menu__help` satisfied both by hand-rolling
 * ~12 declarations each. `.reload-btn__help` and `.menubar-dismiss__help`
 * shipped with NO rules at all, so they inherited only the always-visible
 * `.field-help` base and leaked into the bar as permanent inline body text
 * ("Reload the current view without losing your session." between the reload
 * icon and Sign in). There was no shared class to forget to opt into — that is
 * the bug this spec pins, for EVERY consumer at once rather than one at a time.
 *
 * These assertions read REAL computed styles: `angular.json`'s test target
 * loads `src/styles.scss`, and component styles are applied by TestBed, so the
 * cascade under test here is the cascade that ships.
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
  readonly visible = signal<readonly HomeAnnouncement[]>([]);
  load = jasmine.createSpy('load').and.resolveTo();
}

function announcement(id: string): HomeAnnouncement {
  return {
    id,
    title: 'Planned maintenance',
    body_html: '<p>tonight</p>',
    priority: 1,
    dismissible: true,
    starts_at: null,
    ends_at: null,
  };
}

describe('MenuComponent — chrome help bubbles are revealed, not resident', () => {
  let fixture: ComponentFixture<MenuComponent>;
  let el: HTMLElement;
  let session: SessionStub;
  let bell: BellStub;
  let announcements: AnnouncementsStub;
  let barMode: MenuBarModeService;

  beforeEach(async () => {
    localStorage.removeItem(MENU_BAR_MODE_KEY);
    session = new SessionStub();
    bell = new BellStub();
    announcements = new AnnouncementsStub();

    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: session },
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        { provide: BellNotificationsService, useValue: bell },
        { provide: AnnouncementsService, useValue: announcements as unknown as AnnouncementsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    barMode = TestBed.inject(MenuBarModeService);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expandCollapse();
  });

  /**
   * The bar's contents live inside bootstrap's `.collapse.navbar-collapse`,
   * which is `display: none` below the `lg` breakpoint — and the karma iframe is
   * narrower than that. Without this the controls have no layout box at all, so
   * they cannot take focus and the reveal is untestable. Adding `.show` renders
   * the same EXPANDED bar a desktop viewer sees, which is the state the defect
   * was reported in.
   */
  function expandCollapse(): void {
    el.querySelector('#navbarMain')?.classList.add('show');
  }

  /** Put the fixture in `auto` mode WITH content, so the dismiss control renders. */
  function renderAutoModeBar(): void {
    barMode.setMode('auto');
    announcements.visible.set([announcement('a1')]);
    fixture.detectChanges();
    expandCollapse();
  }

  function find(testid: string): HTMLElement {
    const node = el.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
    expect(node)
      .withContext(`[data-testid="${testid}"] must render for this contract to mean anything`)
      .toBeTruthy();
    return node!;
  }

  /**
   * The whole contract for one control + its help span, asserted against real
   * computed style. `controlId` is the control's data-testid; `helpId` its
   * help span's.
   */
  async function assertRevealContract(controlId: string, helpId: string): Promise<void> {
    const control = find(controlId);
    const help = find(helpId);

    // (1) Still wired for assistive tech — the reveal must never be bought by
    //     dropping the description.
    expect(control.getAttribute('aria-describedby'))
      .withContext(`${controlId} must describe itself by ${helpId}`)
      .toBe(help.id);
    expect(help.textContent?.trim().length)
      .withContext(`${helpId} must still carry its text`)
      .toBeGreaterThan(0);

    const rest = getComputedStyle(help);

    // (2) NOT display:none — a11y tooling and the accname spec both keep a
    //     directly-referenced `visibility: hidden` node, but `display: none`
    //     here would be the lazy fix the operator explicitly ruled out.
    expect(rest.display)
      .withContext(`${helpId} must not be display:none — that is not the reveal idiom`)
      .not.toBe('none');

    // (3) Not painted at rest.
    expect(rest.visibility)
      .withContext(`${helpId} paints in the bar at rest — it must be a revealed bubble`)
      .toBe('hidden');
    expect(rest.opacity)
      .withContext(`${helpId} is opaque at rest — it must be a revealed bubble`)
      .toBe('0');

    // (4) Out of flow, so it cannot squat horizontal space between the icons
    //     even while revealed. This is the assertion that would have caught the
    //     original defect on its own: the leaked spans were `position: static`
    //     block text inside the flex bar.
    expect(['absolute', 'fixed'])
      .withContext(`${helpId} is in normal flow (position: ${rest.position}) and takes bar space`)
      .toContain(rest.position);

    // (5) It does come back on keyboard focus — hidden-forever is not the fix
    //     either. `:focus-within` on the anchor is the mechanism; hover cannot
    //     be synthesised here, but it is the same selector list.
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

    // (6) …and it reads as a BUBBLE, not a ribbon. An absolutely positioned box
    //     with no width shrink-to-fits against whatever sliver of the containing
    //     block is left over — for a ~2.5rem icon anchor that is a couple of
    //     characters, and the sentence unfurls vertically. (Measured live on the
    //     bg-toggle before this fix: 32px wide, 657px tall.)
    const bubble = help.getBoundingClientRect();
    const anchor = control.getBoundingClientRect();
    expect(bubble.width)
      .withContext(
        `${helpId} is ${Math.round(bubble.width)}x${Math.round(bubble.height)} — ` +
          'squeezed to its anchor instead of sizing to its text',
      )
      .toBeGreaterThan(anchor.width);
  }

  it('view reload: help is a focus-revealed bubble, not resident bar text', async () => {
    await assertRevealContract('view-reload', 'view-reload-help');
  });

  it('menubar dismiss: help is a focus-revealed bubble, not resident bar text', async () => {
    renderAutoModeBar();
    await assertRevealContract('menubar-dismiss', 'menubar-dismiss-help');
  });

  // The profile trigger used to be asserted here as "the consumer that already
  // conformed". It is no longer a menubar control — the user menu moved to the
  // header banner (issue #19 comment, 2026-08-19) — so the same contract is
  // asserted at its new home, along with the two chrome toggles that moved with
  // it: see header/header-controls.help-reveal.spec.ts.

  /**
   * The idiom itself, not one consumer of it. EVERY `.field-help` that is a
   * direct child of the bar's flex chrome must be a bubble; anything that is
   * merely block help belongs under a stacked control (the disabled-entry
   * reasons, the dropdown item help), never in the horizontal run.
   */
  it('no .field-help is left painting inline inside the menu bar itself', () => {
    renderAutoModeBar();
    const nav = el.querySelector('nav.navbar')!;
    const offenders: string[] = [];

    for (const help of Array.from(nav.querySelectorAll<HTMLElement>('.field-help'))) {
      // Disabled-entry reasons sit UNDER their stacked <li>, not in the run.
      if (help.closest('li[role="none"]')) continue;

      const cs = getComputedStyle(help);
      const resident = cs.visibility !== 'hidden' && cs.opacity !== '0';
      if (resident) {
        offenders.push(
          `${help.getAttribute('data-testid') ?? help.id ?? help.className}` +
            ` (visibility:${cs.visibility} opacity:${cs.opacity} position:${cs.position})`,
        );
      }
    }

    expect(offenders)
      .withContext('these help spans paint as permanent inline text in the menu bar')
      .toEqual([]);
  });
});
