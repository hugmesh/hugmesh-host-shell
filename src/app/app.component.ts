import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { BackgroundComponent } from './background/background.component';
import { HeaderComponent } from './header/header.component';
import { MenuComponent } from './menu/menu.component';
import { FooterComponent } from './footer/footer.component';

@Component({
  selector: '[app-root]',
  imports: [RouterOutlet, BackgroundComponent, HeaderComponent, MenuComponent, FooterComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly doc = inject(DOCUMENT);

  /** Skip-link handler. Moves focus (not just the scroll position) to the routed
   *  page's #maincontent so keyboard + screen-reader users land in the content,
   *  per WCAG 2.4.1. The routed page component owns the #maincontent id. */
  skipToMain(event: Event): void {
    event.preventDefault();
    const main = this.doc.getElementById('maincontent');
    if (!main) return;
    if (main.getAttribute('tabindex') === null) {
      main.setAttribute('tabindex', '-1');
    }
    main.focus({ preventScroll: false });
    main.scrollIntoView();
  }
}
