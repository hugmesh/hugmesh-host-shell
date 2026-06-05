import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: '[personal-header]',
  host: {
    id: 'personal-header',
    class: 'text-center',
  },
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './header.component.scss',
})
export class HeaderComponent {}
