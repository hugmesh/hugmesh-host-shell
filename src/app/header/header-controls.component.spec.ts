import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { HeaderControlsComponent } from './header-controls.component';
import { SessionService } from '../session.service';
import { BellNotificationsService } from '../bell/bell-notifications.service';

/**
 * THE HEADER'S CHROME CONTROLS — the profile (user) menu's help text and
 * keyboard contract, and the notification bell.
 *
 * These suites used to live in menu.component.spec.ts, because the controls
 * lived in the menubar. They moved with the markup (operator requirement, issue
 * #19 comment 2026-08-19: "the animation button, the menu toggle, the
 * notification bell and user menu belong in the title at the top on the right,
 * not in the menu"). Carried over rather than rewritten: a placement change must
 * not quietly cost the WAI-ARIA menu keyboard contract or the unread badge.
 *
 * WHERE THE CONTROLS ARE is a separate concern with a separate spec —
 * header-controls.placement.spec.ts mounts the WHOLE shell, because a defect
 * that is "the right control in the wrong template" is invisible to any
 * single-component fixture.
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
  cleared = false;
  hasRole(role: string) { return this.roles().some((r) => r.toLowerCase() === role.toLowerCase()); }
  // ASYNC, mirroring the real SessionService.clear(): it awaits POST /bff/sessionOut so
  // the cookie is dead before anything can re-read it.
  async clear() { this.cleared = true; this.loggedIn.set(false); this.session.set(null); }
}

class BellNotificationsServiceStub {
  unreadCount$ = of(0);
  startPolling = jasmine.createSpy('startPolling');
  stopPolling = jasmine.createSpy('stopPolling');
}

describe('HeaderControlsComponent — user menu', () => {
  let component: HeaderControlsComponent;
  let fixture: ComponentFixture<HeaderControlsComponent>;
  let stub: SessionStub;
  let el: HTMLElement;

  beforeEach(async () => {
    stub = new SessionStub();
    await TestBed.configureTestingModule({
      imports: [HeaderControlsComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: stub },
        { provide: BellNotificationsService, useValue: new BellNotificationsServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderControlsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  describe('profile menu help text (sighted + low/no-sight)', () => {
    const trigger = () =>
      el.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!;

    it('the account-menu trigger has an accessible name describing its PURPOSE', () => {
      const label = trigger().getAttribute('aria-label');
      expect(label).withContext('trigger needs an aria-label').toBeTruthy();
      expect(label).toContain('Account menu');
      // The visible name (alice) is folded into the accessible name.
      expect(label).toContain('alice');
    });

    it('announces a NON-ASCII display name via the accessibleName ASCII util', () => {
      // accessibleName falls back to the display name when no screen-reader name is
      // set; here we simply prove the computed wires the session label through it.
      stub.session.set({ label: '山田太郎' });
      fixture.detectChanges();
      expect(trigger().getAttribute('aria-label')).toBe('Account menu for 山田太郎');
    });

    it('the trigger has VISIBLE help wired via aria-describedby to an existing target', () => {
      const describedby = trigger().getAttribute('aria-describedby');
      expect(describedby).toBe('profile-trigger-help');
      const help = el.querySelector('#profile-trigger-help');
      expect(help).withContext('describedby target must exist').toBeTruthy();
      expect(help!.textContent?.trim().length).toBeGreaterThan(10);
    });

    it('every open dropdown item has describedby help that EXISTS and is informative', () => {
      stub.isAdmin.set(true);
      stub.isMod.set(true);
      fixture.detectChanges();
      component.toggleProfile();
      fixture.detectChanges();

      const items = Array.from(
        el.querySelectorAll<HTMLElement>('.profile-menu__item'),
      );
      // Profile, Admin, API docs, Moderation, Wiki, Owncast, Tube, Games (admin
      // reaches them all — the games ENTRY POINT admits admins, the games-admin
      // console does not without ROLE_GAMES), Character Studio/Forge, Sign out.
      expect(items.length).withContext('admin+mod sees all 11 items').toBe(11);
      for (const item of items) {
        const id = item.getAttribute('aria-describedby');
        expect(id).withContext(`${item.textContent} needs describedby`).toBeTruthy();
        const help = el.querySelector(`#${id}`);
        expect(help).withContext(`help target ${id} must exist`).toBeTruthy();
        expect(help!.textContent?.trim().length)
          .withContext(`help for ${item.textContent} must be informative`)
          .toBeGreaterThan(10);
      }
    });
  });

  describe('Games profile-menu entry (the member ENTRY POINT — mirrors gamesGuard)', () => {
    function openProfileLabels(): string[] {
      component.toggleProfile();
      fixture.detectChanges();
      return Array.from(el.querySelectorAll<HTMLElement>('.profile-menu__item'))
        .map((i) => i.textContent?.trim() ?? '');
    }

    it('is SHOWN for a bare games member (e2e-gamesonly)', () => {
      stub.isGames.set(true);
      fixture.detectChanges();
      expect(openProfileLabels()).toContain('Games');
    });

    it('is SHOWN for a bare admin (e2e-adminonly) — the guard admits admins to the entry point', () => {
      stub.isAdmin.set(true);
      fixture.detectChanges();
      const labels = openProfileLabels();
      expect(labels).toContain('Games');
      expect(labels).withContext('but NOT the derived console').not.toContain('Games Admin');
    });

    it('is SHOWN for a superadmin', () => {
      stub.isSuperadmin.set(true);
      fixture.detectChanges();
      expect(openProfileLabels()).toContain('Games');
    });

    it('is HIDDEN for a bare mod (mod alone does not earn the games entry point)', () => {
      stub.isMod.set(true);
      fixture.detectChanges();
      expect(openProfileLabels()).not.toContain('Games');
    });

    it('is HIDDEN for a plain user', () => {
      expect(openProfileLabels()).not.toContain('Games');
    });

    it('sits immediately BEFORE the Games Admin entry (one games group, member first)', () => {
      const ids = component.profileMenuItems.map((i) => i.testid);
      const games = ids.indexOf('menu-games');
      const gamesAdmin = ids.indexOf('menu-games-admin');
      expect(games).toBeGreaterThanOrEqual(0);
      expect(gamesAdmin).withContext('Games Admin directly follows Games').toBe(games + 1);
    });

    it('activating it navigates to /games', () => {
      stub.isGames.set(true);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigateByUrl');
      const item = component.profileMenuItems.find((i) => i.testid === 'menu-games')!;
      component.onProfileItem(item);
      expect(navigateSpy).toHaveBeenCalledWith('/games');
    });
  });

  describe('Games Admin profile-menu entry (Phase 8/10 DERIVED ROLE_GAMES_ADMIN)', () => {
    function openProfileLabels(): string[] {
      component.toggleProfile();
      fixture.detectChanges();
      return Array.from(el.querySelectorAll<HTMLElement>('.profile-menu__item'))
        .map((i) => i.textContent?.trim() ?? '');
    }

    it('is HIDDEN for a bare admin (admin alone does not earn games-admin)', () => {
      stub.isAdmin.set(true);
      fixture.detectChanges();
      expect(openProfileLabels()).not.toContain('Games Admin');
    });

    it('is HIDDEN for a bare mod (mod alone does not earn games-admin)', () => {
      stub.isMod.set(true);
      fixture.detectChanges();
      expect(openProfileLabels()).not.toContain('Games Admin');
    });

    it('is SHOWN for the derived games-admin tier', () => {
      stub.isGamesAdmin.set(true);
      fixture.detectChanges();
      expect(openProfileLabels()).toContain('Games Admin');
    });

    it('is SHOWN for a superadmin', () => {
      stub.isSuperadmin.set(true);
      fixture.detectChanges();
      expect(openProfileLabels()).toContain('Games Admin');
    });

    it('activating it navigates to /games/admin', () => {
      stub.isGamesAdmin.set(true);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigateByUrl');
      const item = component.profileMenuItems.find((i) => i.testid === 'menu-games-admin')!;
      component.onProfileItem(item);
      expect(navigateSpy).toHaveBeenCalledWith('/games/admin');
    });
  });

  describe('profile dropdown — WAI-ARIA menu keyboard operability', () => {
    const trigger = () =>
      el.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!;
    const items = () =>
      Array.from(el.querySelectorAll<HTMLElement>('.profile-menu__item'));
    const triggerKey = (key: string) =>
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const menuKey = (key: string) => {
      const list = el.querySelector<HTMLElement>('#profile-menu-list')!;
      list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };

    beforeEach(() => {
      // Anonymous-by-default + admin/mod off => only Profile + Sign out visible (2).
      stub.isAdmin.set(false);
      stub.isMod.set(false);
      fixture.detectChanges();
    });

    it('opens closed (no item is a tab stop while closed)', () => {
      expect(component.profileOpen()).toBeFalse();
      expect(component.profileActiveIndex()).toBe(-1);
    });

    it('ArrowDown on the trigger opens the menu and lands the cursor on the FIRST item', () => {
      triggerKey('ArrowDown');
      fixture.detectChanges();
      expect(component.profileOpen()).toBeTrue();
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('ArrowUp on the trigger opens the menu and lands the cursor on the LAST item', () => {
      triggerKey('ArrowUp');
      fixture.detectChanges();
      expect(component.profileOpen()).toBeTrue();
      expect(component.profileActiveIndex()).toBe(component.visibleProfileItems().length - 1);
    });

    it('Enter/Space (native click) opens the menu with the cursor on the first item', () => {
      component.toggleProfile();
      fixture.detectChanges();
      expect(component.profileOpen()).toBeTrue();
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('exactly ONE menu item is a tab stop (tabindex 0) while open — true roving tabindex', () => {
      component.toggleProfile();
      fixture.detectChanges();
      const tabbable = items().filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabbable.length).toBe(1);
      expect(items()[0].getAttribute('tabindex')).toBe('0');
      expect(items()[1].getAttribute('tabindex')).toBe('-1');
    });

    it('ArrowDown in the open menu advances the roving cursor and wraps at the end', () => {
      component.toggleProfile(); // cursor at 0
      fixture.detectChanges();
      const last = component.visibleProfileItems().length - 1;
      menuKey('ArrowDown');
      expect(component.profileActiveIndex()).toBe(1);
      // Walk to the last item, then wrap to the first.
      component.profileActiveIndex.set(last);
      menuKey('ArrowDown');
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('ArrowUp in the open menu retreats and wraps from the first to the last', () => {
      component.toggleProfile(); // cursor at 0
      fixture.detectChanges();
      menuKey('ArrowUp');
      expect(component.profileActiveIndex()).toBe(component.visibleProfileItems().length - 1);
    });

    it('Home/End jump the roving cursor to the first/last item', () => {
      component.toggleProfile();
      fixture.detectChanges();
      menuKey('End');
      expect(component.profileActiveIndex()).toBe(component.visibleProfileItems().length - 1);
      menuKey('Home');
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('moves DOM focus to the newly-active item as the cursor moves', () => {
      component.toggleProfile();
      fixture.detectChanges();
      const focusSpy = spyOn(component.profileItemRefs.get(1)!.nativeElement, 'focus');
      menuKey('ArrowDown');
      expect(focusSpy).toHaveBeenCalled();
    });

    it('Escape from the open menu closes it AND restores focus to the trigger', () => {
      component.toggleProfile();
      fixture.detectChanges();
      const focusSpy = spyOn(component.profileTriggerRef!.nativeElement, 'focus');
      const list = el.querySelector<HTMLElement>('#profile-menu-list')!;
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(component.profileOpen()).toBeFalse();
      expect(component.profileActiveIndex()).toBe(-1);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('activating an item with click closes the menu and clears the roving cursor', () => {
      component.toggleProfile();
      fixture.detectChanges();
      items()[0].click();
      fixture.detectChanges();
      expect(component.profileOpen()).toBeFalse();
      expect(component.profileActiveIndex()).toBe(-1);
    });
  });

});

// ---------------------------------------------------------------------------
// Bell icon — isolated describe block with its own TestBed configuration so the
// Router spy and BellNotificationsService stub do not leak into the user-menu
// suite above. Moved here from menu.component.spec.ts with the bell itself: the
// menubar unmounts on the login page, on the signed-in home and after an
// auto-mode dismissal, so an unread badge that lived in it kept disappearing.
// ---------------------------------------------------------------------------

class BellSessionStub {
  loggedIn = signal(true);
  fullyRegistered = signal(true);
  // Same missing member as SessionStub above — see the note there. Derived from
  // loggedIn so the bell block's logged-out cases flip it correctly too.
  isUser = computed(() => this.loggedIn());
  isAdmin = signal(false);
  isMod = signal(false);
  isSuperadmin = signal(false);
  isGames = signal(false);
  isGamesAdmin = signal(false);
  roles = signal<string[]>([]);
  session = signal<{ label: string } | null>({ label: 'alice' });
  hasRole(role: string) { return this.roles().some((r) => r.toLowerCase() === role.toLowerCase()); }
  clear() { /* no-op in bell tests */ }
}

describe('HeaderControlsComponent — bell icon', () => {
  let fixture: ComponentFixture<HeaderControlsComponent>;
  let sessionStub: BellSessionStub;
  let bellStub: BellNotificationsServiceStub;

  /** Create a fresh component with the given bellStub already configured. The
   *  component captures unreadCount$ at injection time, so the stub must be set
   *  up before createComponent() is called. */
  async function setup(bell: BellNotificationsServiceStub = new BellNotificationsServiceStub()): Promise<void> {
    sessionStub = new BellSessionStub();
    bellStub = bell;

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HeaderControlsComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: sessionStub },
        { provide: BellNotificationsService, useValue: bellStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderControlsComponent);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('renders the bell button when logged in', () => {
    sessionStub.loggedIn.set(true);
    fixture.detectChanges();
    const bell = fixture.nativeElement.querySelector('.bell-btn');
    expect(bell).toBeTruthy();
    expect(bell.getAttribute('aria-label')).toBe('Notifications');
  });

  it('does not render the bell when logged out', () => {
    sessionStub.loggedIn.set(false);
    fixture.detectChanges();
    const bell = fixture.nativeElement.querySelector('.bell-btn');
    expect(bell).toBeNull();
  });

  it('shows badge with count when unreadCount$ emits a positive value', fakeAsync(async () => {
    const countBell = new BellNotificationsServiceStub();
    countBell.unreadCount$ = of(3);
    await setup(countBell);
    sessionStub.loggedIn.set(true);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.bell-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe('3');
  }));

  it('hides the badge when unreadCount$ emits 0', fakeAsync(() => {
    sessionStub.loggedIn.set(true);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.bell-badge');
    expect(badge).toBeNull();
  }));

  it('shows 99+ when unread count exceeds 99', fakeAsync(async () => {
    const countBell = new BellNotificationsServiceStub();
    countBell.unreadCount$ = of(150);
    await setup(countBell);
    sessionStub.loggedIn.set(true);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.bell-badge');
    expect(badge?.textContent?.trim()).toBe('99+');
  }));

  it('navigates to /user/notifications when bell is clicked', () => {
    sessionStub.loggedIn.set(true);
    fixture.detectChanges();
    const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    const bell = fixture.nativeElement.querySelector('.bell-btn');
    bell.click();
    expect(navSpy).toHaveBeenCalledWith('/user/notifications');
  });

  it('calls startPolling when session is logged in', () => {
    // The effect fires immediately on component creation when loggedIn() is true.
    expect(bellStub.startPolling).toHaveBeenCalled();
  });

  it('calls stopPolling when session is logged out', () => {
    sessionStub.loggedIn.set(false);
    fixture.detectChanges();
    expect(bellStub.stopPolling).toHaveBeenCalled();
  });
});
