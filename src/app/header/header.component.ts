import { Component, ChangeDetectionStrategy, computed, inject, input } from '@angular/core';

import { BackgroundAnimation, HeaderControlsComponent } from './header-controls.component';
import { ChromeThemeService } from '../chrome/chrome-theme.service';

/** The shell banner: the wordmark, plus the chrome control cluster at its inline
 *  END (operator requirement, issue #19 comment 2026-08-19 — "the animation
 *  button, the menu toggle, the notification bell and user menu belong in the
 *  title at the top on the right, not in the menu").
 *
 *  The banner takes the backdrop instance as an input rather than reaching for
 *  it: AppComponent owns the single <app-background> and hands it down, so the
 *  pause toggle can live up here without the header importing (and eagerly
 *  pulling in) the background component's three.js/Vanta module graph. */
@Component({
  selector: '[personal-header]',
  imports: [HeaderControlsComponent],
  host: {
    id: 'personal-header',
    class: 'text-center',
  },
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  private readonly chromeTheme = inject(ChromeThemeService);

  /** The animated backdrop the pause toggle drives. Optional: mounted without
   *  it (specs, or any future banner-only host) the toggle simply is not shown. */
  readonly background = input<BackgroundAnimation | null>(null);

  /**
   * The banner's headline text. `--sd-header-content` (or its `--hug-` twin) is
   * the generator's replacement-text axis; absent, the shipped brand wordmark
   * ships unchanged — the conservative-schema guarantee, in markup form.
   *
   * WHAT THE TOKEN REPLACES, and what it does not: the CONTENT of the banner, i.e.
   * the wordmark line. It never removes the control cluster beside it, because the
   * bell, the user menu, the menubar toggle and the animation toggle are FUNCTION,
   * not content — a theme that silently deleted the only route to the user menu
   * would be a lockout, not a restyle. A theme that wants no banner at all says so
   * outright with `--sd-header-display: none`, which is honoured in CSS.
   *
   * Identity policy is enforced UPSTREAM, where it belongs: the Studio decides
   * whether a given build may change brand text at all, and this shell renders
   * what the theme it was handed actually says.
   */
  readonly wordmark = computed(() => this.chromeTheme.content('header')() ?? 'HugMesh');

  /** True while the banner is showing operator-supplied text rather than the
   *  shipped wordmark. Drives the display-face opt-out below and lets a spec
   *  assert the branch without string-matching the rendered text. */
  readonly themedWordmark = computed(() => this.chromeTheme.content('header')() !== null);
}
