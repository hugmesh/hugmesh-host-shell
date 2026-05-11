import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

interface MenuItem {
  label:    string;
  route:    string;
  disabled: boolean;
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
  styleUrl: './menu.component.scss',
})
export class MenuComponent {
  readonly items = MENU_ITEMS;

  private readonly router = inject(Router);

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
