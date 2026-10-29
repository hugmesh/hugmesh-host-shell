import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { SessionService } from '../session.service';
import { ProfileModalService } from '../profile-modal/profile-modal.service';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { MenuBarModeService } from '../menu/menu-bar-mode.service';
import { accessibleName } from '../accessible-name';

/** The slice of {@link BackgroundComponent} this chrome drives. Structural on
 *  purpose: the header must not import the background component (and drag its
 *  three.js/Vanta module graph into the always-eager banner) just to render a
 *  pause button. AppComponent owns the instance and hands it down. */
export interface BackgroundAnimation {
  paused(): boolean;
  toggle(): void;
}

/** An item inside the profile dropdown menu. `action` either navigates to a
 *  remote ('admin'/'apidocs'/'mod'/'wiki'/'owncast'/'tube'/'games'/'games-admin'),
 *  opens the profile modal, or signs out. `show` gates the role-specific Admin /
 *  API docs / Moderation / Wiki / Owncast / Tube / Games entries on the live
 *  session. */
export interface ProfileMenuItem {
  label: string;
  testid: string;
  action: 'profile' | 'admin' | 'apidocs' | 'mod' | 'wiki' | 'owncast' | 'tube' | 'games' | 'games-admin'
        | 'character-studio' | 'character-forge' | 'logout';
  route?: string;
  show: () => boolean;
  /** Concise help describing WHAT activating the item does + WHERE it goes. Shown
   *  as visible .field-help and wired to the item via aria-describedby so screen
   *  readers announce it WITH the item. */
  help: string;
}

/**
 * THE SHELL'S CHROME CONTROL REGION — the header's top-right cluster.
 *
 * Operator requirement (issue #19 comment, 2026-08-19): "the animation button,
 * the menu toggle, the notification bell and user menu belong in the title at
 * the top on the right, not in the menu", and "you left the buttons below so
 * they're duplicated".
 *
 * Before this component the four controls had three different homes and no
 * single owner:
 *   - the background-animation toggle and the menubar-mode toggle were
 *     `position: fixed` chrome anchored to the BOTTOM-RIGHT corner of
 *     app.component.html — nowhere near the title, and stacked over content;
 *   - the notification bell and the profile (user) menu lived inside
 *     menu.component.html's account region, which UNMOUNTS with the bar (login
 *     page, auto-mode dismissal, the signed-in home's card view) — so the user
 *     menu and the unread badge simply vanished on those views.
 * Scattering them is what made a duplicate so easy to leave behind: no template
 * could see the other copies. They now have exactly ONE home, and the specs in
 * header-controls.placement.spec.ts assert both halves of that (in the header,
 * and nowhere else).
 *
 * The controls kept every behaviour and every a11y hook they had — same test
 * ids, same aria-pressed/haspopup/expanded/describedby wiring, same visible
 * .field-help idiom, same WAI-ARIA menu keyboard contract — because this is a
 * MOVE, not a rewrite.
 */
@Component({
  selector: 'hug-header-controls',
  imports: [AsyncPipe],
  host: {
    'data-testid': 'header-controls',
    class: 'header-controls',
  },
  templateUrl: './header-controls.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './header-controls.component.scss',
})
export class HeaderControlsComponent {
  readonly session = inject(SessionService);
  private readonly modal = inject(ProfileModalService);
  private readonly router = inject(Router);
  private readonly bellNotifications = inject(BellNotificationsService);

  /** The visitor's menubar mode: 'static' (always shown, default) vs 'auto'
   *  (content-earned + dismissable). The SWITCH deliberately lives out here in
   *  the header and not inside the bar it hides: a control that hides its own
   *  container would strand the user with no way back the moment it worked. */
  readonly menuBarMode = inject(MenuBarModeService);

  /** The animated backdrop, handed down by AppComponent (which owns the single
   *  instance). Null in isolation — the toggle simply does not render, rather
   *  than rendering a button that toggles nothing. */
  readonly background = input<BackgroundAnimation | null>(null);

  /** Unread notification count — drives the bell badge. Emits 0 when unauthenticated
   *  (polling is stopped and the BehaviorSubject is reset by stopPolling()). */
  readonly unreadCount$ = this.bellNotifications.unreadCount$;

  /** Profile dropdown — Profile (modal) + the conditional Admin / API docs /
   *  Moderation role shortcuts + Sign out. Admin and the admin-only API docs
   *  console appear ONLY for admins; Moderation ONLY for moderators. */
  readonly profileMenuItems: readonly ProfileMenuItem[] = [
    { label: 'Profile',    testid: 'menu-profile', action: 'profile', show: () => true,
      help: 'Opens your profile editor in a dialog.' },
    { label: 'Admin',      testid: 'menu-admin',   action: 'admin',   route: '/admin',      show: () => this.session.isAdmin(),
      help: 'Go to the admin console (administrators only).' },
    { label: 'API docs',   testid: 'menu-apidocs', action: 'apidocs', route: '/admin/docs', show: () => this.session.isAdmin(),
      help: 'Browse the platform API documentation (administrators only).' },
    { label: 'Moderation', testid: 'menu-mod',     action: 'mod',     route: '/mod',        show: () => this.session.isMod(),
      help: 'Go to the moderation console (moderators only).' },
    // WIKI management console — shown to the wiki access tier: admins + superadmins
    // always, plus a moderator additionally granted the per-service ROLE_WIKI
    // (a bare mod does NOT see it). Mirrors the wikiGuard that protects the /wiki
    // mount, so the entry is never a dead link.
    { label: 'Wiki',       testid: 'menu-wiki',    action: 'wiki',    route: '/wiki',       show: () => this.canAccessWiki(),
      help: 'Manage the platform wiki (admins, superadmins, and granted moderators).' },
    // OWNCAST live-stream console — shown to the Owncast access tier: streamers
    // granted the per-service ROLE_OWNCAST, plus admins/superadmins (grant
    // management) and moderators (stream moderation). NOTE: unlike the sibling
    // Wiki/Tube entries, this does NOT exactly mirror the owncastGuard — the guard
    // admits only admin|superadmin|ROLE_OWNCAST, so a bare moderator (mod without
    // ROLE_OWNCAST) sees this entry but is bounced to /login if clicked. See
    // canAccessOwncast()'s doc below for the full rationale.
    { label: 'Owncast',    testid: 'menu-owncast', action: 'owncast', route: '/owncast',    show: () => this.canAccessOwncast(),
      help: 'Manage your live stream (streamers, moderators, admins, and superadmins).' },
    // TUBE subscription-archive console — shown to the Tube access tier: users
    // granted the per-service ROLE_TUBE, plus admins/superadmins (quota/retention
    // management). A bare moderator does NOT see it. Mirrors the tubeGuard that
    // protects the /tube mount, so the entry is never a dead link.
    { label: 'Tube',       testid: 'menu-tube',    action: 'tube',    route: '/tube',       show: () => this.canAccessTube(),
      help: 'Manage your YouTube subscription archive (granted users, admins, and superadmins).' },
    // GAMES member entry-point (the games catalog remote mounted at /games).
    // Mirrors the gamesGuard EXACTLY: a ROLE_GAMES holder, or an admin /
    // superadmin (management/oversight always reach the entry point — the
    // wiki/tube/owncast precedent). A bare mod or plain user never sees it and
    // could not pass the guard at /games. Placed BEFORE Games Admin so the two
    // games entries read as one group (member first, console second).
    { label: 'Games',      testid: 'menu-games',   action: 'games',   route: '/games',      show: () => this.canAccessGames(),
      help: 'Browse and play the games on this mesh (games members, admins, and superadmins).' },
    // GAMES-ADMIN console (Phase 8/10) — shown ONLY to the DERIVED
    // ROLE_GAMES_ADMIN tier (session.isGamesAdmin: ROLE_GAMES ∩ (ROLE_ADMIN ∪
    // ROLE_MOD)), plus superadmins. A bare games member or a bare admin/mod does
    // NOT see it. Mirrors the gamesAdminGuard that protects the /games/admin
    // mount, so the entry is never a dead link.
    { label: 'Games Admin', testid: 'menu-games-admin', action: 'games-admin', route: '/games/admin', show: () => this.canAccessGamesAdmin(),
      help: 'Manage the games namespace (games admins and superadmins only).' },
    // CHARACTER remotes. Shown to any FULLY-REGISTERED session — deliberately not
    // role-gated: the gateway admits a plain ROLE_USER to both (verified live: 200
    // for e2e-user, 401 anonymous), and there is no per-service role to gate on, so
    // a tighter `show` here would hide a feature the backend grants. `fullyRegistered`
    // (not merely loggedIn) mirrors the registeredGuard on their routes, so the entry
    // never offers a destination the guard will bounce.
    { label: 'Character Studio', testid: 'menu-character-studio', action: 'character-studio', route: '/character-studio', show: () => this.session.fullyRegistered(),
      help: 'Build a layered anthro/furry character (the profile character generator).' },
    { label: 'Character Forge',  testid: 'menu-character-forge',  action: 'character-forge',  route: '/character-forge',  show: () => this.session.fullyRegistered(),
      help: 'Forge a 3D character from your saved parts.' },
    { label: 'Sign out',   testid: 'menu-logout',  action: 'logout',  show: () => true,
      help: 'Sign out and return to the login page.' },
  ];

  /** The profile-menu items the current session may see. */
  readonly visibleProfileItems = computed(() =>
    this.profileMenuItems.filter((i) => i.show()),
  );

  /** The WIKI access tier (mirrors the host wikiGuard exactly): an admin or
   *  superadmin always, or a moderator additionally granted the per-service
   *  ROLE_WIKI. A plain user / bare moderator is excluded — they never see the
   *  Wiki entry and could not pass the guard if they reached /wiki directly. */
  private canAccessWiki(): boolean {
    return (
      this.session.isAdmin() ||
      this.session.isSuperadmin() ||
      (this.session.isMod() && this.session.hasRole('WIKI'))
    );
  }

  /** The OWNCAST access tier (mirrors the host owncastGuard's role gate PLUS the
   *  menu's broader visibility intent): a streamer granted the per-service
   *  ROLE_OWNCAST, an admin or superadmin (grant management), OR a moderator
   *  (stream moderation). A plain user without ROLE_OWNCAST never sees the entry;
   *  a bare moderator sees it for the moderation surface (the guard then admits
   *  admin|superadmin|ROLE_OWNCAST, so a bare mod is bounced at /owncast — the BFF
   *  is the real boundary). */
  private canAccessOwncast(): boolean {
    return (
      this.session.hasRole('OWNCAST') ||
      this.session.isAdmin() ||
      this.session.isSuperadmin() ||
      this.session.isMod()
    );
  }

  /** The TUBE access tier (mirrors the host tubeGuard exactly): a user granted the
   *  per-service ROLE_TUBE, or an admin or superadmin (quota/retention management).
   *  A bare moderator is excluded — they never see the Tube entry and could not pass
   *  the guard if they reached /tube directly (mod-side tube moderation lives in
   *  mod-bff, not this remote). */
  private canAccessTube(): boolean {
    return (
      this.session.hasRole('TUBE') ||
      this.session.isAdmin() ||
      this.session.isSuperadmin()
    );
  }

  /** The GAMES entry-point tier (mirrors the host gamesGuard exactly): a ROLE_GAMES
   *  holder, or an admin / superadmin. NOT isGamesAdmin — that is the narrower
   *  console tier below; a bare admin reaches the catalog without it. */
  private canAccessGames(): boolean {
    return this.session.isGames() || this.session.isAdmin() || this.session.isSuperadmin();
  }

  /** The GAMES-ADMIN access tier (mirrors the host gamesAdminGuard exactly): the
   *  DERIVED ROLE_GAMES_ADMIN tier (session.isGamesAdmin — ROLE_GAMES ∩
   *  (ROLE_ADMIN ∪ ROLE_MOD)), or a superadmin. A bare games member or a bare
   *  admin/mod WITHOUT games is excluded — they never see the entry and could
   *  not pass the guard if they reached /games/admin directly. */
  private canAccessGamesAdmin(): boolean {
    return this.session.isGamesAdmin() || this.session.isSuperadmin();
  }

  /** Accessible NAME for the profile-menu trigger. The visible label is the user's
   *  display name (email/discord handle, possibly NON-ASCII); the button itself has
   *  no purpose text, so we announce a clean "Account menu for <name>" using the
   *  shared {@link accessibleName} ASCII util — so a screen reader announces a
   *  pronounceable name (the ASCII screen-reader name when the display name carries
   *  characters AT cannot voice) plus what the control opens. */
  readonly profileTriggerLabel = computed(() => {
    const label = this.session.session()?.label ?? '';
    const spoken = accessibleName(label, null);
    return spoken ? `Account menu for ${spoken}` : 'Account menu';
  });

  /** Whether the profile dropdown is expanded. */
  readonly profileOpen = signal(false);

  @ViewChild('profileTrigger', { read: ElementRef })
  profileTriggerRef?: ElementRef<HTMLButtonElement>;

  @ViewChildren('profileItem', { read: ElementRef })
  profileItemRefs!: QueryList<ElementRef<HTMLButtonElement>>;

  /** Roving-tabindex cursor for the OPEN profile dropdown (WAI-ARIA menu pattern):
   *  exactly ONE menuitem is a tab stop (tabindex 0), the rest tabindex -1, and the
   *  arrow keys move DOM focus. -1 while the menu is closed (no item is a stop). */
  readonly profileActiveIndex = signal(-1);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Start or stop bell polling whenever the login state changes. Owned HERE
    // now that the bell itself is: the menubar used to run this, and the menubar
    // unmounts (login page, auto-mode dismissal, the home card view) — so the
    // badge's own data source came and went with a bar the badge no longer
    // belongs to. The header banner is always mounted.
    effect(() => {
      if (this.session.loggedIn()) {
        this.bellNotifications.startPolling();
      } else {
        this.bellNotifications.stopPolling();
      }
    });

    // Close the dropdown on navigation. A menu left open across a route change
    // floats over content that has nothing to do with it.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => {
        this.profileOpen.set(false);
        this.profileActiveIndex.set(-1);
      });
  }

  /** Navigate to the notifications page (user-ui remote mounted at /user). */
  navigateToBell(): void {
    void this.router.navigateByUrl('/user/notifications');
  }

  /** Toggle the profile dropdown menu (the button is aria-haspopup="menu"). When
   *  opening, place the roving cursor on the FIRST item and move focus into the
   *  menu (WAI-ARIA menu-button: a pointer/Enter/Space open lands on the first
   *  item). When closing, drop the cursor. */
  toggleProfile(): void {
    this.profileOpen.update((v) => !v);
    if (this.profileOpen()) {
      this.openProfileAt(0);
    } else {
      this.profileActiveIndex.set(-1);
    }
  }

  /** Open the dropdown (if closed) with the roving cursor at `index` and move DOM
   *  focus to that item. `index` -1 means the LAST item (ArrowUp-to-open). */
  private openProfileAt(index: number): void {
    const count = this.visibleProfileItems().length;
    if (count === 0) return;
    const target = index < 0 ? count - 1 : Math.min(index, count - 1);
    this.profileOpen.set(true);
    this.profileActiveIndex.set(target);
    // Wait for the @if-guarded menu list to render before focusing the item.
    queueMicrotask(() => this.focusProfileItem(target));
  }

  private focusProfileItem(index: number): void {
    this.profileItemRefs?.get(index)?.nativeElement.focus();
  }

  /** Keyboard handler for the trigger BUTTON. ArrowDown/ArrowUp open the menu and
   *  land on the first/last item per the WAI-ARIA menu-button pattern; Enter/Space
   *  fall through to the native (click)=toggleProfile. Escape closes if open. */
  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.openProfileAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.openProfileAt(-1);
    } else if (event.key === 'Escape' && this.profileOpen()) {
      event.preventDefault();
      this.closeProfile();
    }
  }

  /** Roving-tabindex keyboard handler for the OPEN profile dropdown menu (WAI-ARIA
   *  menu pattern). ArrowUp/ArrowDown move the cursor (wrapping), Home/End jump to
   *  the ends, and DOM focus follows. Escape is handled separately on the list. */
  onProfileMenuKeydown(event: KeyboardEvent): void {
    const count = this.visibleProfileItems().length;
    if (count === 0) return;
    const cur = this.profileActiveIndex();
    let next: number | undefined;

    if (event.key === 'ArrowDown') {
      next = (cur + 1) % count;
    } else if (event.key === 'ArrowUp') {
      next = (cur - 1 + count) % count;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = count - 1;
    }

    if (next !== undefined) {
      event.preventDefault();
      this.profileActiveIndex.set(next);
      this.focusProfileItem(next);
    }
  }

  /** Handle a profile-menu item activation. */
  onProfileItem(item: ProfileMenuItem): void {
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    switch (item.action) {
      case 'profile':
        this.modal.open();
        break;
      case 'admin':
      case 'apidocs':
      case 'mod':
      case 'wiki':
      case 'owncast':
      case 'tube':
      case 'games':
      case 'games-admin':
        if (item.route) this.router.navigateByUrl(item.route);
        break;
      // CHARACTER remotes. remoteName is the kebab-case 'character-studio' /
      // 'character-forge' in app.routes.ts — native-federation registers a remote
      // under the name declared inside its OWN remoteEntry.json, not the manifest
      // key, so a camelCase key throws "Remote 'characterStudio' is not initialized"
      // at load time with no failed request to point at.
      case 'character-studio':
      case 'character-forge':
        if (item.route) this.router.navigateByUrl(item.route);
        break;
      case 'logout':
        void this.logout();
        break;
    }
  }

  /** Close the dropdown and return focus to its trigger (Escape from the menu). */
  closeProfile(restoreFocus = true): void {
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    if (restoreFocus) this.profileTriggerRef?.nativeElement.focus();
  }

  /** Sign out: expire the SERVER session, then return to the authgate at '/', which
   *  redirects anonymous users into the login remote.
   *
   *  The await is load-bearing. {@link SessionService.clear} now posts /bff/sessionOut and
   *  waits for it, because the cookie has to be dead BEFORE we navigate — roleHomeGuard
   *  reads the session on the way through, and a live cookie would let a re-hydrate restore
   *  the session and route the "signed-out" user straight back into their role-home. */
  async logout(): Promise<void> {
    await this.session.clear();
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    await this.router.navigateByUrl('/');
  }
}
