import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';

import { ChromeThemeService } from '../chrome/chrome-theme.service';

/**
 * The shell footer.
 *
 * Consumes the generator's CHROME axis for its own surface exactly as the banner
 * does (issue #19 items 4 + 8): hide / height / background / text-twin are pure
 * `var()` chains in footer.component.scss, and `--sd-footer-content` — the
 * replacement-text axis — is rendered here as REAL MARKUP rather than a CSS
 * `content:` read, so an operator's footer line is selectable, translatable and
 * present in the accessibility tree. See chrome/chrome-tokens.ts for why that
 * branch of the generator's contract is the one this shell takes.
 */
@Component({
  selector: '[personal-footer]',
  host: {
    id: 'personal-footer',
  },
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  private readonly chromeTheme = inject(ChromeThemeService);

  /**
   * The theme's replacement footer text, or `null` when it said nothing — in
   * which case the shipped content (the page-source link) renders unchanged.
   *
   * Unlike the banner, the footer's shipped content is a single link and nothing
   * else, so "replacement content" here means what it says: the operator's line
   * takes its place. Nothing functional is lost — the footer carries no control,
   * no navigation and no session affordance.
   */
  readonly content = computed(() => this.chromeTheme.content('footer')());
}
