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
    // `--sd-header-display: none` collapses the BANNER, not the shell's only
    // route to the account menu — see `chromeHidden` below.
    '[class.header--chrome-hidden]': 'chromeHidden()',
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

  /**
   * The theme's HIDE switch for this surface (`--sd-header-display: none`).
   *
   * THE SAME REASONING AS `wordmark` ABOVE, APPLIED TO THE AXIS THAT ACTUALLY
   * DELETES THINGS. That docstring refuses to let the CONTENT axis remove the
   * control cluster because "a theme that silently deleted the only route to the
   * user menu would be a lockout, not a restyle" — and then pointed at
   * `--sd-header-display: none` as the honest way to ask for no banner. Measured,
   * that pointer was the lockout: `grep -rl "signOut" src/app --include=*.html`
   * returns exactly one file, header-controls.component.html, so a `display:none`
   * on this host took sign-out, the profile menu, the role consoles, the
   * notification bell, the menubar toggle and the animation toggle with it, with
   * no second route to any of them anywhere in the shell.
   *
   * So the switch is honoured as far as it can honestly go: this class strips the
   * banner to nothing — surface, scrim, border, elevation, flag ribbon, spacing
   * and the wordmark itself all go (header.component.scss) — and the control
   * cluster stays, unpainted, at the inline end. An operator who hides the header
   * gets no header; they do not get a shell their users cannot sign out of.
   *
   * The FOOTER keeps honouring its own hide switch purely in CSS, with no code
   * and no exception, because it carries no control, no navigation and no session
   * affordance (see FooterComponent's own docstring). One surface differs from
   * the other because the surfaces differ, not because the axis does.
   */
  readonly chromeHidden = computed(() => this.chromeTheme.hidden('header')());
}
