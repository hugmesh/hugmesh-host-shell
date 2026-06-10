import { Injectable, signal } from '@angular/core';

/** Shared open/close state for the single host-level profile modal. The profile
 *  menu calls open(); the ProfileModalComponent (mounted once in AppComponent)
 *  renders the user remote's ./profile editor while `isOpen()` is true and calls
 *  close() on Escape / backdrop / the close button. Kept as a tiny signal-backed
 *  service so the trigger (menu) and the dialog (app shell) stay decoupled. */
@Injectable({ providedIn: 'root' })
export class ProfileModalService {
  private readonly open$ = signal(false);
  /** True while the profile dialog should be shown. */
  readonly isOpen = this.open$.asReadonly();

  open(): void {
    this.open$.set(true);
  }
  close(): void {
    this.open$.set(false);
  }
}
