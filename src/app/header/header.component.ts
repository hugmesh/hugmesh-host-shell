import { Component } from '@angular/core';

@Component({
  selector: '[personal-header]',
  host: {
    id: 'personal-header',
    class: 'text-center',
  },
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {}
