import { Component, DestroyRef, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SessionService } from '../session.service';

interface MenuItem {
  label:    string;
  route:    string;
  disabled: boolean;
}

/** A session/role-gated federation nav entry (Phase 10). `show` is evaluated
 *  against the live session signal so the link appears/disappears as the login
 *  remote writes snap.session. `todo` marks the not-yet-built /mod placeholder. */
interface FederationNavItem {
  label: string;
  route: string;
  testid: string;
  show: () => boolean;
  todo?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Introduction', route: 'home',     disabled: false },
  { label: 'Projects',     route: 'projects', disabled: true  },
  { label: 'About',        route: 'about',    disabled: false },
];

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
  readonly items = MENU_ITEMS;
  readonly session = inject(SessionService);

  /** Federation entries, visibility-gated per role/registration exactly like the
   *  route guards: Matrix/Mastodon only when fullyRegistered, Admin only for
   *  admins, Mod (TODO) only for moderators. Sign in / Sign out handled in the
   *  template off session.loggedIn(). */
  private readonly federationItems: readonly FederationNavItem[] = [
    { label: 'Matrix',   route: '/social/matrix',   testid: 'nav-matrix',   show: () => this.session.fullyRegistered() },
    { label: 'Mastodon', route: '/social/mastodon', testid: 'nav-mastodon', show: () => this.session.fullyRegistered() },
    { label: 'Admin',    route: '/admin',           testid: 'nav-admin',    show: () => this.session.isAdmin() },
    { label: 'Mod (TODO)', route: '/mod',           testid: 'nav-mod',      show: () => this.session.isMod(), todo: true },
  ];

  /** The federation entries the current session is allowed to see. */
  readonly visibleFederationItems = computed(() =>
    this.federationItems.filter((i) => i.show()),
  );

  private readonly router = inject(Router);

  /** Sign out: clear the shared session then return to the public landing. */
  logout(): void {
    this.session.clear();
    this.router.navigateByUrl('/');
  }

  constructor() {
    inject(DestroyRef);

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const main = document.getElementById('maincontent') as HTMLElement | null;
        main?.focus();
      });
  }

  onMenuKeydown(event: KeyboardEvent, index: number): void {
    const enabledIndices = this.items
      .map((item, i) => (!item.disabled ? i : -1))
      .filter((i) => i !== -1);

    const pos    = enabledIndices.indexOf(index);
    let   target = -1;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      target = enabledIndices[(pos + 1) % enabledIndices.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      target = enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length];
    } else if (event.key === 'Home') {
      target = enabledIndices[0];
    } else if (event.key === 'End') {
      target = enabledIndices[enabledIndices.length - 1];
    }

    if (target !== -1) {
      event.preventDefault();
      const btn = document.querySelector<HTMLElement>(`[data-menu-index="${target}"]`);
      btn?.focus();
    }
  }
}
