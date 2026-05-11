import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackgroundComponent } from './background/background.component';
import { HeaderComponent } from './header/header.component';
import { MenuComponent } from './menu/menu.component';
import { FooterComponent } from './footer/footer.component';

@Component({
  selector: '[app-root]',
  imports: [RouterOutlet, BackgroundComponent, HeaderComponent, MenuComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  skipToMain(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('maincontent') as HTMLElement | null;
    main?.focus({ preventScroll: false });
    main?.scrollIntoView();
  }
}
