import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AboutSectionComponent } from './about-section/about-section.component';

// TODO(about-content): this public, unguarded route still renders placeholder
// copy ("Example Question?" / "Example Paragraph" in about.component.html) and
// has no nav link anywhere pointing at it (the menu's "Home" entry routes to
// '/', not '/home' or '/about') — reachable only by typing the URL. Needs real
// brand copy before it's worth linking; see README's "Known gaps".
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
