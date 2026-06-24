import { AsyncPipe, DOCUMENT } from '@angular/common';
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
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { SessionService } from '../session.service';
import { ProfileModalService } from '../profile-modal/profile-modal.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { accessibleName } from '../accessible-name';
import { BellNotificationsService } from '../bell/bell-notifications.service';

/** A primary menubar entry. The router-outlet is the swappable content region, so
 *  selecting an entry navigates the host: Home -> the role-home remote ('/'),
 *  Mastodon/Matrix -> the social remotes. `enabled` reacts to the live session AND
 *  the federation install-state so an entry is reachable only when BOTH its service
 *  is installed AND the user is fully registered, matching the registeredGuard
 *  (visible-but-disabled, never a dead link).
 *
 *  `slug` is the optional federation-capability slug an entry depends on (absent
 *  for the always-present Home). `disabledReason()` returns the helptext explaining
 *  WHY a disabled entry is disabled — not installed on this deployment vs the
 *  session not yet registered — wired via aria-describedby (defense-in-depth: grey
 *  + EXPLAIN, never hide). */
interface NavEntry {
  label: string;
  route: string;
  testid: string;
  slug?: string;
  enabled: () => boolean;
  disabledReason: () => string;
}

/** An item inside the profile dropdown menu. `action` either navigates to a
 *  remote ('admin'/'apidocs'/'mod'/'wiki'/'owncast'/'tube'), opens the profile
 *  modal, or signs out. `show` gates the role-specific Admin / API docs /
 *  Moderation / Wiki / Owncast / Tube entries on the live session. */
interface ProfileMenuItem {
  label: string;
  testid: string;
  action: 'profile' | 'admin' | 'apidocs' | 'mod' | 'wiki' | 'owncast' | 'tube' | 'logout';
  route?: string;
  show: () => boolean;
  /** Concise help describing WHAT activating the item does + WHERE it goes. Shown
   *  as visible .field-help and wired to the item via aria-describedby so screen
   *  readers announce it WITH the item. */
  help: string;
}

@Component({
  selector: '[menu]',
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  host: {
    id: 'menu',
  },
  templateUrl: './menu.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './menu.component.scss',
})
export class MenuComponent {
  readonly session = inject(SessionService);
  private readonly modal = inject(ProfileModalService);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly capabilities = inject(CapabilitiesService);
  private readonly bellNotifications = inject(BellNotificationsService);

  /** Unread notification count — drives the bell badge. Emits 0 when unauthenticated
   *  (polling is stopped and the BehaviorSubject is reset by stopPolling()). */
  readonly unreadCount$ = this.bellNotifications.unreadCount$;

  /** UNIVERSAL NAV — Home | Mastodon | Matrix. Home returns to the role-home
   *  remote ('' -> roleHomeGuard redirect); Mastodon/Matrix swap the content
   *  outlet to the social remotes. A social entry is enabled only when its service
   *  is INSTALLED (federation capability) AND the session is fully registered; an
   *  uninstalled service greys out by install-state, a registered-gate by
   *  registration — each with its own helptext reason. */
  readonly navEntries: readonly NavEntry[] = [
    {
      label: 'Home', route: '/', testid: 'nav-home',
      enabled: () => true,
      disabledReason: () => '',
    },
    {
      label: 'Mastodon', route: '/social/mastodon', testid: 'nav-mastodon', slug: 'mastodon',
      enabled: () => this.capabilities.installed('mastodon') && this.session.fullyRegistered(),
      disabledReason: () => this.socialDisabledReason('mastodon'),
    },
    {
      label: 'Matrix', route: '/social/matrix', testid: 'nav-matrix', slug: 'matrix',
      enabled: () => this.capabilities.installed('matrix') && this.session.fullyRegistered(),
      disabledReason: () => this.socialDisabledReason('matrix'),
    },
  ];

  /** Why a social entry is disabled: NOT installed on this deployment takes
   *  precedence over the registration gate (an absent service can't be unlocked by
   *  registering). Surfaced as aria-describedby helptext on the disabled button. */
  private socialDisabledReason(slug: string): string {
    if (!this.capabilities.installed(slug)) {
      return 'This service is not available on this deployment.';
    }
    if (!this.session.fullyRegistered()) {
      return 'Complete your registration to use this.';
    }
    return '';
  }

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
    // management) and moderators (stream moderation). Mirrors the owncastGuard that
    // protects the /owncast mount, so the entry is never a dead link.
    { label: 'Owncast',    testid: 'menu-owncast', action: 'owncast', route: '/owncast',    show: () => this.canAccessOwncast(),
      help: 'Manage your live stream (streamers, moderators, admins, and superadmins).' },
    // TUBE subscription-archive console — shown to the Tube access tier: users
    // granted the per-service ROLE_TUBE, plus admins/superadmins (quota/retention
    // management). A bare moderator does NOT see it. Mirrors the tubeGuard that
    // protects the /tube mount, so the entry is never a dead link.
    { label: 'Tube',       testid: 'menu-tube',    action: 'tube',    route: '/tube',       show: () => this.canAccessTube(),
      help: 'Manage your YouTube subscription archive (granted users, admins, and superadmins).' },
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

  /** Roving-tabindex cursor for the primary menubar (WAI-ARIA menubar pattern):
   *  exactly ONE menuitem is a tab stop (tabindex 0); the rest are tabindex -1
   *  and reachable only with the arrow keys. */
  activeIndex = 0;

  /** Whether the profile dropdown is expanded. */
  readonly profileOpen = signal(false);

  @ViewChildren('navBtn', { read: ElementRef })
  navButtonRefs!: QueryList<ElementRef<HTMLButtonElement>>;

  @ViewChild('profileTrigger', { read: ElementRef })
  profileTriggerRef?: ElementRef<HTMLButtonElement>;

  @ViewChildren('profileItem', { read: ElementRef })
  profileItemRefs!: QueryList<ElementRef<HTMLButtonElement>>;

  /** Roving-tabindex cursor for the OPEN profile dropdown (WAI-ARIA menu pattern):
   *  exactly ONE menuitem is a tab stop (tabindex 0), the rest tabindex -1, and the
   *  arrow keys move DOM focus. -1 while the menu is closed (no item is a stop). */
  readonly profileActiveIndex = signal(-1);

  /** Indices of the enabled primary entries (the arrow-key cycle skips disabled). */
  private get enabledIndices(): number[] {
    return this.navEntries.map((e, i) => (e.enabled() ? i : -1)).filter((i) => i !== -1);
  }

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Start or stop bell polling whenever the login state changes. The effect()
    // runs in the injection context (constructor body) so it tracks session.loggedIn()
    // reactively: first call fires immediately, then re-runs on every change.
    effect(() => {
      if (this.session.loggedIn()) {
        this.bellNotifications.startPolling();
      } else {
        this.bellNotifications.stopPolling();
      }
    });

    // The menu is always mounted, so it is the host's natural owner for loading the
    // PUBLIC federation capability list ONCE at startup (load-once + shared, so the
    // home-services cards reuse the same fetch). Fire-and-forget: a failed/empty
    // load greys every optional service rather than breaking the shell.
    void this.capabilities.load();

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => {
        // Close the profile menu on navigation, then focus the routed content.
        this.profileOpen.set(false);
        this.profileActiveIndex.set(-1);
        this.doc.getElementById('maincontent')?.focus();
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
        if (item.route) this.router.navigateByUrl(item.route);
        break;
      case 'logout':
        this.logout();
        break;
    }
  }

  /** Close the dropdown and return focus to its trigger (Escape from the menu). */
  closeProfile(restoreFocus = true): void {
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    if (restoreFocus) this.profileTriggerRef?.nativeElement.focus();
  }

  /** Sign out: clear the shared session then return to the authgate at '/', which
   *  redirects anonymous users into the login remote. */
  logout(): void {
    this.session.clear();
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    this.router.navigateByUrl('/');
  }

  /** Roving-tabindex keyboard handler for the primary menubar. Arrow/Home/End
   *  move the active cursor across the enabled entries (wrapping, skipping the
   *  disabled ones) and move DOM focus to the new entry. Other keys are no-ops so
   *  Tab/Enter behave natively. */
  onMenuKeydown(event: KeyboardEvent): void {
    const enabled = this.enabledIndices;
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(this.activeIndex);
    let next: number | undefined;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = enabled[(pos + 1) % enabled.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = enabled[(pos - 1 + enabled.length) % enabled.length];
    } else if (event.key === 'Home') {
      next = enabled[0];
    } else if (event.key === 'End') {
      next = enabled[enabled.length - 1];
    }

    if (next !== undefined) {
      event.preventDefault();
      this.activeIndex = next;
      this.navButtonRefs.get(next)?.nativeElement.focus();
    }
  }
}
