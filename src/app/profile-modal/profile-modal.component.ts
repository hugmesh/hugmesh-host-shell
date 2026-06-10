import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Type,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, NgComponentOutlet } from '@angular/common';
import { loadRemoteModule } from '@angular-architects/native-federation';

import { ProfileModalService } from './profile-modal.service';

/** Resolve the user remote's standalone ProfileComponent (exposed module
 *  './profile'). Indirected through a holder so unit tests can stub the loader —
 *  the native-federation ESM namespace export is read-only and can't be spied. */
export const profileRemoteLoader = {
  load: (): Promise<Type<unknown>> =>
    loadRemoteModule('user', './profile').then(
      (m) => (m as { ProfileComponent: Type<unknown> }).ProfileComponent,
    ),
};

/**
 * Host-level modal dialog that mounts the user remote's ./profile editor
 * (ProfileComponent, standalone) loaded via loadRemoteModule('user','./profile').
 *
 * Accessibility (the locked design's modal contract):
 *   - role="dialog" + aria-modal="true" + aria-labelledby on the title,
 *   - focus moves INTO the dialog on open and is RESTORED to the trigger on close,
 *   - a focus TRAP keeps Tab/Shift+Tab inside the dialog,
 *   - Escape and the backdrop and the close button all dismiss it.
 *
 * The dialog is rendered once in the app shell; ProfileModalService toggles it,
 * so the profile menu (the trigger) and the dialog stay decoupled. Other own
 * micro-frontend component menus can reuse this same modal pattern.
 */
@Component({
  selector: 'app-profile-modal',
  imports: [NgComponentOutlet],
  templateUrl: './profile-modal.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './profile-modal.component.scss',
})
export class ProfileModalComponent {
  readonly modal = inject(ProfileModalService);
  private readonly doc = inject(DOCUMENT);

  /** The lazily-resolved remote ProfileComponent class for NgComponentOutlet. */
  readonly profileComponent = signal<Type<unknown> | null>(null);
  /** True while the remote module is being fetched. */
  readonly loading = signal(false);
  /** Non-empty when the remote failed to load (shown in a role=alert). */
  readonly loadError = signal('');

  /** The dialog root — focus trap + initial focus target live here. */
  @ViewChild('dialog') dialogRef?: ElementRef<HTMLElement>;

  /** The element focused before the dialog opened, restored on close (WCAG 2.4.3). */
  private lastFocused: HTMLElement | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    let wasOpen = false;

    effect(() => {
      const open = this.modal.isOpen();
      if (open && !wasOpen) this.onOpen();
      if (!open && wasOpen) this.onClose();
      wasOpen = open;
    });

    destroyRef.onDestroy(() => {
      if (wasOpen) this.releaseScrollLock();
    });
  }

  private onOpen(): void {
    this.lastFocused = this.doc.activeElement as HTMLElement | null;
    this.loadError.set('');
    // Lock body scroll while the modal owns the viewport.
    this.doc.body.classList.add('modal-open');
    if (!this.profileComponent()) {
      this.loading.set(true);
      profileRemoteLoader
        .load()
        .then((cmp) => this.profileComponent.set(cmp))
        .catch(() => this.loadError.set('Could not load your profile editor. Please try again.'))
        .finally(() => {
          this.loading.set(false);
          queueMicrotask(() => this.focusDialog());
        });
    } else {
      queueMicrotask(() => this.focusDialog());
    }
  }

  private onClose(): void {
    this.releaseScrollLock();
    // Restore focus to whatever opened the dialog (the profile menu trigger).
    this.lastFocused?.focus?.();
    this.lastFocused = null;
  }

  private releaseScrollLock(): void {
    this.doc.body.classList.remove('modal-open');
  }

  /** Move focus to the first focusable element in the dialog (else the dialog). */
  private focusDialog(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;
    const focusable = this.focusableElements(dialog);
    (focusable[0] ?? dialog).focus();
  }

  /** Close on the backdrop, the close button, and Escape. */
  close(): void {
    this.modal.close();
  }

  onBackdropClick(event: MouseEvent): void {
    // Only when the click is on the backdrop itself, not bubbled from the panel.
    if (event.target === event.currentTarget) this.close();
  }

  /** Keyboard handling for the dialog: Escape closes, Tab is trapped inside. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;
    const focusable = this.focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.doc.activeElement;

    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Visible, focusable descendants of the dialog, in DOM order. */
  private focusableElements(root: HTMLElement): HTMLElement[] {
    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), ' +
      'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.offsetParent !== null || el === this.doc.activeElement,
    );
  }
}
