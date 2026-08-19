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
 * MENUBAR MODE rendering contract (issue #19), end to end through the template:
 *
 *  - 'static' (default): the bar always renders and carries NO dismiss control;
 *  - 'auto': the bar renders ONLY while announcements or unread notifications
 *    are present, offers a dismiss control, a dismissal hides it, and FRESH
 *    content brings it back.
 *
 * Own spec file with its own TestBed (the menu.federation-nav / reload-button
 * precedent) so the announcements/bell doubles never leak into the menubar
 * keyboard suites.
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
  /** A live subject, so specs can deliver a "new notification" mid-test. */
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

describe('MenuComponent — configurable menubar mode (static vs auto)', () => {
  let fixture: ComponentFixture<MenuComponent>;
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
  });

  afterEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));

  function navbar(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('nav.navbar');
  }
  function dismissBtn(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="menubar-dismiss"]');
  }

  it('STATIC (the default): the bar always renders, with no dismiss control', () => {
    expect(barMode.mode()).toBe('static');
    expect(navbar()).withContext('static bar renders with no content present').toBeTruthy();
    expect(dismissBtn()).withContext('an always-on bar must not offer a close box').toBeNull();
  });

  it('STATIC never fetches announcements for the gate (home banner keeps owning its load)', () => {
    expect(announcements.load).not.toHaveBeenCalled();
  });

  it('AUTO with nothing present: the bar does not render at all', () => {
    barMode.setMode('auto');
    fixture.detectChanges();
    expect(navbar()).withContext('no announcements, no unread — no bar').toBeNull();
  });

  it('AUTO loads the shared announcements list to know whether content is present', () => {
    barMode.setMode('auto');
    fixture.detectChanges();
    expect(announcements.load).toHaveBeenCalled();
  });

  it('AUTO + unread notifications: the bar renders and is dismissable', () => {
    barMode.setMode('auto');
    bell.unreadCount$.next(3);
    fixture.detectChanges();
    expect(navbar()).withContext('unread notifications earn the bar').toBeTruthy();
    const btn = dismissBtn();
    expect(btn).withContext('auto bar carries the dismiss control').toBeTruthy();
    expect(btn!.getAttribute('aria-label')).toBeTruthy();
    // The dismiss control explains that the bar comes back on its own.
    const help = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="menubar-dismiss-help"]');
    expect(help?.textContent).toContain('new announcements or notifications');
  });

  it('AUTO + active announcements: the bar renders too', () => {
    barMode.setMode('auto');
    announcements.visible.set([announcement('a1')]);
    fixture.detectChanges();
    expect(navbar()).withContext('announcements earn the bar').toBeTruthy();
  });

  it('dismiss hides the bar; FRESH content re-reveals it', () => {
    barMode.setMode('auto');
    bell.unreadCount$.next(1);
    fixture.detectChanges();
    expect(navbar()).toBeTruthy();

    dismissBtn()!.click();
    fixture.detectChanges();
    expect(navbar()).withContext('dismissed — the bar leaves').toBeNull();

    // The count MOVING (a second notification) is what re-earns the bar —
    // steady state after a dismissal does not.
    bell.unreadCount$.next(2);
    fixture.detectChanges();
    expect(navbar()).withContext('fresh content brings the bar back').toBeTruthy();
  });

  it('switching back to STATIC restores the bar even after a dismissal', () => {
    barMode.setMode('auto');
    bell.unreadCount$.next(1);
    fixture.detectChanges();
    dismissBtn()!.click();
    fixture.detectChanges();
    expect(navbar()).toBeNull();

    barMode.setMode('static');
    fixture.detectChanges();
    expect(navbar()).withContext('static means always shown — stale dismissals do not stick').toBeTruthy();
  });

  it('the pick persists: a mode chosen here seeds the next visit (localStorage contract)', () => {
    barMode.setMode('auto');
    expect(localStorage.getItem(MENU_BAR_MODE_KEY)).toBe('auto');
  });
});
