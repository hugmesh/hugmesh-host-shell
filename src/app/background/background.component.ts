import { Component, signal, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-background',
  templateUrl: './background.component.html',
  styleUrl: './background.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '[class.is-paused]': 'paused()' },
})
export class BackgroundComponent {
  readonly paused = signal(false);

  toggle(): void {
    this.paused.update(v => !v);
  }
}
