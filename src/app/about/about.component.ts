import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { BrandNameService } from '../brand-name.service';
import { AboutSectionComponent } from './about-section/about-section.component';

// NOTE: this public route now renders real HugMesh platform copy (was
// placeholder "Example Question?" / "Example Paragraph"). It still has no nav
// link anywhere pointing at it (the menu's "Home" entry routes to '/', not
// '/home' or '/about') — reachable only by typing the URL. Wiring it into the
// nav is a separate product decision; see README's "Known gaps".
@Component({
  selector: '[about]',
  imports: [AboutSectionComponent],
  host: {
    class: 'container mt-1 mb-5',
  },
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  /** What this deploy calls itself (the theme's wordmark, else the served title). */
  readonly brand = inject(BrandNameService).name;
}
