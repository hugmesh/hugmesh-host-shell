import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: '[personal-footer]',
  host: {
    id: 'personal-footer',
  },
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './footer.component.scss',
})
export class FooterComponent {}
