import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { MenuComponent } from './menu.component';
import { MENU_BAR_MODE_KEY } from './menu-bar-mode.service';
import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { AnnouncementsService } from '../announcements/announcements.service';

/**
 * CONSOLE SUBMENU **LAYOUT** (operator report: the console submenu "squishes
 * everything in the screen").
 *
 * This is a GEOMETRY spec, deliberately separate from menu.home-cards.spec.ts,
 * which already proves the submenu RENDERS with the right links. Rendering was
 * never the problem: the submenu rendered on the same flex LINE as the entry
 * list, so ~30 admin section links were crushed into a tall vertical sliver at
 * the right-hand edge and the primary entries were squeezed to whatever was
 * left. Measured on the deployed build at 1600px before the fix:
 *   entries  {x:1,   y:369, w:672, h:98}
 *   submenu  {x:870, y:345, w:729, h:149}   <- beside, not below
 * and at 992px the submenu was 121px wide and 1212px TALL.
 *
 * Root cause: `.nav-submenu` set `width: 100%` and the stylesheet's own comment
 * claimed "the bar itself is flex-wrap: wrap". It is not — bootstrap's
 * `.navbar-expand-lg` sets `flex-wrap: nowrap` from 992px up, so a 100%-wide
 * flex item just shrinks (flex-shrink defaults to 1) and stays on the line.
 *
 * These assertions therefore MEASURE, and they only mean anything on the
 * desktop side of the lg breakpoint — hence the explicit viewport guard. Karma
 * renders specs in an iframe that is width:100% of the browser window, so the
 * window size set in karma.conf.js IS the viewport the media queries see.
 */

class SessionStub {
  loggedIn = signal(true);
  fullyRegistered = signal(true);
  isUser = computed(() => this.loggedIn());
  isAdmin = signal(true);
  isMod = signal(true);
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
  readonly visible = signal<readonly never[]>([]);
  load = jasmine.createSpy('load').and.resolveTo();
}

/** The lg breakpoint bootstrap's `.navbar-expand-lg` switches on. */
const LG = 992;

describe('MenuComponent — the console submenu is its own row (layout)', () => {
  let fixture: ComponentFixture<MenuComponent>;
  let router: Router;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.removeItem(MENU_BAR_MODE_KEY);

    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([
          { path: 'user', children: [] },
          { path: 'about', children: [] },
          {
            path: 'admin',
            children: [{ path: 'usage', children: [] }],
          },
          { path: 'mod', children: [{ path: 'console', children: [] }] },
        ]),
        { provide: SessionService, useValue: new SessionStub() },
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        { provide: BellNotificationsService, useValue: new BellStub() },
        {
          provide: AnnouncementsService,
          useValue: new AnnouncementsStub() as unknown as AnnouncementsService,
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(MenuComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));

  async function goto(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture.detectChanges();
  }

  const navbar = () => el.querySelector('nav.navbar') as HTMLElement;
  const entryList = () =>
    el.querySelector('nav.navbar ul.navbar-nav[role="menubar"]') as HTMLElement;
  const submenu = () => el.querySelector('[data-testid="nav-submenu"]') as HTMLElement;

  /** Fail LOUDLY rather than pass vacuously if the harness is too narrow: below
   *  992px the submenu wraps on its own anyway, so every assertion here would be
   *  trivially green while proving nothing about the layout that actually broke. */
  function requireDesktopViewport(): void {
    expect(window.matchMedia(`(min-width: ${LG}px)`).matches)
      .withContext(
        `these are DESKTOP-layout assertions and the karma window is only ` +
          `${window.innerWidth}px wide — set --window-size >= ${LG} in karma.conf.js`,
      )
      .toBeTrue();
  }

  it('runs on the desktop side of the lg breakpoint (guard for the specs below)', () => {
    requireDesktopViewport();
  });

  it('sits BELOW the entry list, not beside it', async () => {
    requireDesktopViewport();
    await goto('/admin');

    const entries = entryList().getBoundingClientRect();
    const sub = submenu().getBoundingClientRect();

    expect(sub.top)
      .withContext(
        `the submenu must start below the entries (entries bottom=${entries.bottom}, ` +
          `submenu top=${sub.top}, submenu left=${sub.left}, entries left=${entries.left})`,
      )
      .toBeGreaterThanOrEqual(entries.bottom);
  });

  it('spans the bar rather than being squeezed into a column beside it', async () => {
    requireDesktopViewport();
    await goto('/admin');

    const bar = navbar().getBoundingClientRect();
    const sub = submenu().getBoundingClientRect();

    // A genuine full-width row: allow for the bar's own padding/border only.
    expect(sub.width)
      .withContext(`submenu ${sub.width}px inside a ${bar.width}px bar`)
      .toBeGreaterThan(bar.width * 0.9);
  });

  it('does not steal width from the primary entries', async () => {
    requireDesktopViewport();
    // '/about' is a plain destination: the bar renders, no console is active,
    // so no submenu competes for the line. ('/user' would swap the whole bar for
    // the home service cards.)
    await goto('/about');
    expect(submenu()).withContext('no console active => no submenu').toBeNull();
    const relaxed = entryList().getBoundingClientRect().width;

    await goto('/admin');
    const withSubmenu = entryList().getBoundingClientRect().width;

    expect(withSubmenu)
      .withContext(
        `opening a console must not compress the entries ` +
          `(${relaxed}px without the submenu, ${withSubmenu}px with it)`,
      )
      .toBeCloseTo(relaxed, 0);
  });

  it('starts at the bar\'s leading edge, like a row — not part-way across it', async () => {
    requireDesktopViewport();
    await goto('/admin');

    const bar = navbar().getBoundingClientRect();
    const sub = submenu().getBoundingClientRect();

    // Before the fix the row began at x=870 on a bar whose content started at
    // x≈8: it was sitting in the leftover space beside the entries.
    expect(sub.left - bar.left)
      .withContext(`submenu starts ${sub.left - bar.left}px into the bar`)
      .toBeLessThan(8);
  });

  it('the bar is allowed to wrap at every breakpoint (the mechanism, not just this instance)', async () => {
    requireDesktopViewport();
    await goto('/admin');

    // bootstrap's .navbar-expand-lg pins flex-wrap:nowrap from 992px up; any
    // full-width second row in this bar depends on that being overridden.
    expect(getComputedStyle(navbar()).flexWrap)
      .withContext('nav.navbar must wrap, or no child can ever form its own row')
      .toBe('wrap');
    expect(getComputedStyle(submenu()).flexBasis)
      .withContext('a 100% flex-BASIS is what forces the wrap; width:100% alone only shrinks')
      .toBe('100%');
  });

  it('holds for the moderation console too, with its much shorter section list', async () => {
    requireDesktopViewport();
    await goto('/mod/console');

    const entries = entryList().getBoundingClientRect();
    const sub = submenu().getBoundingClientRect();

    expect(sub.top).toBeGreaterThanOrEqual(entries.bottom);
  });
});
