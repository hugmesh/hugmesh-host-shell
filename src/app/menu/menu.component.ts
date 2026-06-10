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

/** A primary menubar entry. The router-outlet is the swappable content region, so
 *  selecting an entry navigates the host: Home -> the role-home remote ('/'),
 *  Mastodon/Matrix -> the social remotes. `enabled` reacts to the live session so
 *  Mastodon/Matrix are reachable only once the user is fully registered, matching
 *  the registeredGuard on those routes (visible-but-disabled, never a dead link). */
interface NavEntry {
  label: string;
  route: string;
  testid: string;
  enabled: () => boolean;
}

/** An item inside the profile dropdown menu. `action` either navigates to a
 *  remote ('admin'/'mod'), opens the profile modal, or signs out. `show` gates
 *  the role-specific Admin/Moderation entries on the live session. */
interface ProfileMenuItem {
  label: string;
  testid: string;
  action: 'profile' | 'admin' | 'mod' | 'logout';
  route?: string;
  show: () => boolean;
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

  /** UNIVERSAL NAV — Home | Mastodon | Matrix. Home returns to the role-home
   *  remote ('' -> roleHomeGuard redirect); Mastodon/Matrix swap the content
   *  outlet to the social remotes. */
  readonly navEntries: readonly NavEntry[] = [
    { label: 'Home',     route: '/',                 testid: 'nav-home',     enabled: () => true },
    { label: 'Mastodon', route: '/social/mastodon',  testid: 'nav-mastodon', enabled: () => this.session.fullyRegistered() },
    { label: 'Matrix',   route: '/social/matrix',    testid: 'nav-matrix',   enabled: () => this.session.fullyRegistered() },
  ];

  /** Profile dropdown — Profile (modal) + the conditional Admin / Moderation
   *  role-home shortcuts + Sign out. Admin/Moderation appear ONLY for the role. */
  readonly profileMenuItems: readonly ProfileMenuItem[] = [
    { label: 'Profile',    testid: 'menu-profile', action: 'profile', show: () => true },
    { label: 'Admin',      testid: 'menu-admin',   action: 'admin', route: '/admin', show: () => this.session.isAdmin() },
    { label: 'Moderation', testid: 'menu-mod',     action: 'mod',   route: '/mod',   show: () => this.session.isMod() },
    { label: 'Sign out',   testid: 'menu-logout',  action: 'logout', show: () => true },
  ];

  /** The profile-menu items the current session may see. */
  readonly visibleProfileItems = computed(() =>
    this.profileMenuItems.filter((i) => i.show()),
  );

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
