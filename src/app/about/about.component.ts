import { Component } from '@angular/core';
import { AboutSectionComponent } from './about-section/about-section.component';

@Component({
  selector: '[about]',
  imports: [AboutSectionComponent],
  host: {
    id: 'maincontent',
    tabindex: '-1',
    class: 'container mt-1 mb-5',
  },
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {}
