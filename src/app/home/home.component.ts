import { Component, ChangeDetectionStrategy } from '@angular/core';
import { LinksComponent } from './links/links.component';

@Component({
  selector: '[home]',
  imports: [LinksComponent],
  host: {
    id: 'maincontent',
    tabindex: '-1',
    class: 'container mt-1 mb-5',
  },
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home.component.scss',
})
export class HomeComponent {}
