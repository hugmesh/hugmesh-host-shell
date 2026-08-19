import { Component, ChangeDetectionStrategy, OnDestroy, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { BackgroundComponent } from './background/background.component';
import { HeaderComponent } from './header/header.component';
import { MenuComponent } from './menu/menu.component';
import { FooterComponent } from './footer/footer.component';
import { ProfileModalComponent } from './profile-modal/profile-modal.component';
import { StatusGateComponent } from './account-status/status-gate.component';
import { NotificationToastComponent } from './notification-toast.component';
import { NotificationToastService } from './notification-toast.service';
import { SessionService } from './session.service';
import { MenuBarModeService } from './menu/menu-bar-mode.service';

@Component({
  selector: '[app-root]',
  imports: [
    RouterOutlet,
    BackgroundComponent,
    HeaderComponent,
    MenuComponent,
    FooterComponent,
    ProfileModalComponent,
    StatusGateComponent,
    NotificationToastComponent,
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnDestroy {
  private readonly doc = inject(DOCUMENT);
  protected readonly session = inject(SessionService);
  private readonly notificationToastService = inject(NotificationToastService);
  /** The menubar-mode pick (static vs auto — issue #19). The switch lives HERE,
   *  in the always-present floating chrome, NOT in the bar it hides: a control
   *  that hides its own container would strand the user with no way back the
   *  moment it worked. */
  protected readonly menuBarMode = inject(MenuBarModeService);

  constructor() {
    effect(() => {
      if (this.session.loggedIn()) {
        this.notificationToastService.start();
      } else {
        this.notificationToastService.stop();
      }
    });
  }

  ngOnDestroy(): void {
    this.notificationToastService.stop();
  }

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
