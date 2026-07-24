import { Component, ChangeDetectionStrategy } from '@angular/core';
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
    id: 'maincontent',
    tabindex: '-1',
    class: 'container mt-1 mb-5',
  },
  templateUrl: './about.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './about.component.scss',
})
export class AboutComponent {}
