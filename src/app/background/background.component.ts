import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-background',
  template: '',
  styleUrl: './background.component.scss',
  host: { '[class.is-paused]': 'paused()' },
})
export class BackgroundComponent {
  readonly paused = signal(false);

  toggle(): void {
    this.paused.update(v => !v);
  }
}
