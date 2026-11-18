import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject } from '@angular/core';

import { ChromeThemeService } from './chrome/chrome-theme.service';

/**
 * The name this deploy calls itself, for the places that used to say "HugMesh" in the
 * source: the document title's brand, the home page's and the about page's copy.
 *
 * Where it comes from, in order:
 *   1. the theme's header text (`--sd-header-content`, the wordmark the banner already
 *      shows), so a domain with its own look says its own name everywhere the banner does.
 *      On the local Docker mesh the front door serves each domain's own stylesheet by Host
 *      (generator look_serving), so acme.localhost says "Acme" and example.localhost
 *      "Example" without a rebuild;
 *   2. the page's <title> as the server delivered it, which is what the rename engine
 *      rewrites for a rebranded image;
 *   3. "HugMesh".
 *
 * Identity policy is upstream, as for the banner: the Studio decides whether a build may
 * change brand text at all, and this renders what the theme it was handed says.
 *
 * The served title is read once, when this service is first built. ShellTitleStrategy
 * injects it before any navigation and only then writes its own "<page> — <brand>" title,
 * so the value read here is always the page as delivered.
 */
@Injectable({ providedIn: 'root' })
export class BrandNameService {
  private readonly chromeTheme = inject(ChromeThemeService);
  private readonly served = (inject(DOCUMENT).title || '').trim() || 'HugMesh';

  /** The brand name, reactive: it changes when the theme arrives after bootstrap. */
  readonly name = computed(() => (this.chromeTheme.content('header')() ?? '').trim() || this.served);
}
