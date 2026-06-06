import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChildren,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
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

  /** Roving-tabindex cursor for the primary menubar (WAI-ARIA menubar pattern):
   *  exactly ONE menuitem is a tab stop (tabindex 0); the rest are tabindex -1
   *  and reachable only with the arrow keys. Mirrors usidiamond.dev. */
  activeIndex = 0;

  @ViewChildren('navBtn', { read: ElementRef })
  navButtonRefs!: QueryList<ElementRef<HTMLButtonElement>>;

  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);

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

  /** Indices of the enabled primary items (the arrow-key cycle skips disabled). */
  private get enabledIndices(): number[] {
    return this.items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i !== -1);
  }

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => this.doc.getElementById('maincontent')?.focus());
  }

  /** Sign out: clear the shared session then return to the public landing. */
  logout(): void {
    this.session.clear();
    this.router.navigateByUrl('/');
  }

  /** Roving-tabindex keyboard handler for the primary menubar. Arrow/Home/End
   *  move the active cursor across the enabled items (wrapping, skipping the
   *  disabled ones) and move DOM focus to the new item. Other keys are no-ops so
   *  Tab/Enter behave natively. */
  onMenuKeydown(event: KeyboardEvent): void {
    const enabled = this.enabledIndices;
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
