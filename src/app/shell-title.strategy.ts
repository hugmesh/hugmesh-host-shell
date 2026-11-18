import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { BrandNameService } from './brand-name.service';

/**
 * Document title for every route (WCAG 2.4.2, page titled).
 *
 * Before this, every page, the shell's and every federated remote's, was
 * titled just "HugMesh", so a screen reader announced the same title on each
 * navigation and tabs and history could not be told apart.
 *
 * The page name is the deepest route `title` (Angular's buildTitle): a
 * remote's own child-route title wins, and otherwise the shell's per-mount
 * title from REMOTE_ROUTES applies. The brand is BrandNameService's name: the
 * theme's own wordmark when it sets one (a domain with its own look says its own
 * name in the tab too), else whatever <title> the served index.html carried at
 * boot, so a rebranded deploy keeps its own name rather than a literal compiled
 * in here. The brand is reactive: a theme that arrives after the first
 * navigation retitles the tab.
 */
@Injectable({ providedIn: 'root' })
export class ShellTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  // Injected FIRST: BrandNameService must read the served <title> before this class writes one.
  private readonly brand = inject(BrandNameService);
  private page = '';

  constructor() {
    super();
    effect(() => this.render(this.brand.name()));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.page = this.buildTitle(snapshot)?.trim() ?? '';
    this.render(this.brand.name());
  }

  private render(brand: string): void {
    this.title.setTitle(this.page && this.page !== brand ? `${this.page} — ${brand}` : brand);
  }
}
