import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
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
 *  remote ('admin'/'apidocs'/'mod'), opens the profile modal, or signs out.
 *  `show` gates the role-specific Admin / API docs / Moderation entries on the
 *  live session. */
interface ProfileMenuItem {
  label: string;
  testid: string;
  action: 'profile' | 'admin' | 'apidocs' | 'mod' | 'logout';
  route?: string;
  show: () => boolean;
  /** Concise help describing WHAT activating the item does + WHERE it goes. Shown
   *  as visible .field-help and wired to the item via aria-describedby so screen
   *  readers announce it WITH the item. */
  help: string;
}

@Component({
  selector: '[menu]',
  imports: [RouterLink, RouterLinkActive],
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
    { label: 'Sign out',   testid: 'menu-logout',  action: 'logout',  show: () => true,
      help: 'Sign out and return to the login page.' },
  ];

  /** The profile-menu items the current session may see. */
  readonly visibleProfileItems = computed(() =>
    this.profileMenuItems.filter((i) => i.show()),
  );

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

  /** Indices of the enabled primary entries (the arrow-key cycle skips disabled). */
  private get enabledIndices(): number[] {
    return this.navEntries.map((e, i) => (e.enabled() ? i : -1)).filter((i) => i !== -1);
  }

  constructor() {
    const destroyRef = inject(DestroyRef);

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
        this.doc.getElementById('maincontent')?.focus();
      });
  }

  /** Open the profile dropdown menu (the button is aria-haspopup="menu"). */
  toggleProfile(): void {
    this.profileOpen.update((v) => !v);
  }

  /** Handle a profile-menu item activation. */
  onProfileItem(item: ProfileMenuItem): void {
    this.profileOpen.set(false);
    switch (item.action) {
      case 'profile':
        this.modal.open();
        break;
      case 'admin':
      case 'apidocs':
      case 'mod':
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
    if (restoreFocus) this.profileTriggerRef?.nativeElement.focus();
  }

  /** Sign out: clear the shared session then return to the authgate at '/', which
   *  redirects anonymous users into the login remote. */
  logout(): void {
    this.session.clear();
    this.profileOpen.set(false);
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
