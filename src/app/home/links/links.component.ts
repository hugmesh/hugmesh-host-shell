import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: '[links-grid]',
  host: {
    id: 'links-grid',
    class: 'links-grid container-sm',
  },
  templateUrl: './links.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './links.component.scss',
})
export class LinksComponent {}
