import { Component, ChangeDetectionStrategy, input } from '@angular/core';

import { BackgroundAnimation, HeaderControlsComponent } from './header-controls.component';

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
  /** The animated backdrop the pause toggle drives. Optional: mounted without
   *  it (specs, or any future banner-only host) the toggle simply is not shown. */
  readonly background = input<BackgroundAnimation | null>(null);
}
