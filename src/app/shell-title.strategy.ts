import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * Document title for every route (WCAG 2.4.2, page titled).
 *
 * Before this, every page, the shell's and every federated remote's, was
 * titled just "HugMesh", so a screen reader announced the same title on each
 * navigation and tabs and history could not be told apart.
 *
 * The page name is the deepest route `title` (Angular's buildTitle): a
 * remote's own child-route title wins, and otherwise the shell's per-mount
 * title from REMOTE_ROUTES applies. The brand is whatever <title> the served
 * index.html carried at boot, so a rebranded deploy keeps its own name rather
 * than a literal compiled in here.
 */
@Injectable({ providedIn: 'root' })
export class ShellTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly brand =
    (inject(DOCUMENT).title || '').trim() || 'HugMesh';

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot)?.trim();
    this.title.setTitle(page && page !== this.brand ? `${page} — ${this.brand}` : this.brand);
  }
}
