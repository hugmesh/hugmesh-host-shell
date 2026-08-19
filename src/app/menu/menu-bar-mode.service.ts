import { Injectable, signal } from '@angular/core';

/** How the menubar earns its screen space (operator requirement, issue #19):
 *
 *  - 'static' — the bar is always shown (the shipped behaviour, and the default:
 *    an un-configured deploy renders exactly as before);
 *  - 'auto'   — the bar renders ONLY while there is something to show in it
 *    (active announcements or unread notifications), and is dismissable; a
 *    dismissal holds until fresh content arrives.
 */
export type MenuBarMode = 'static' | 'auto';

/** localStorage key for the visitor's menubar-mode pick. Follows the theme
 *  system's client-side persistence pattern — login-ui persists the visitor's
 *  background-preset pick under 'hug.login.background' the same way (a 'hug.*'
 *  key, parsed defensively, try/catch around storage): the choice is a
 *  per-browser presentation preference, not server state. */
export const MENU_BAR_MODE_KEY = 'hug.shell.menubar';

/** Parse an UNTRUSTED stored/config value into a mode, or null. Anything that is
 *  not exactly one of the two modes (old builds, hand-edited storage) is
 *  rejected so the caller falls back to the default instead of rendering from
 *  garbage — same stance as login-ui's parseBackgroundPreset. */
export function parseMenuBarMode(raw: unknown): MenuBarMode | null {
  return raw === 'static' || raw === 'auto' ? raw : null;
}

/**
 * Holds the visitor's menubar mode (persisted) plus the auto-mode DISMISSED flag
 * (deliberately in-memory only: a dismissal means "not right now", not "never
 * again" — reloads and fresh content both bring the bar back; the mode is the
 * durable choice).
 *
 * The service owns STATE only. What counts as "content is present" — active
 * announcements, unread notifications — is composed in MenuComponent, which
 * already holds both feeds; it calls {@link reveal} when fresh content arrives.
 */
@Injectable({ providedIn: 'root' })
export class MenuBarModeService {
  /** The current mode. Seeded synchronously from localStorage (no flash of the
   *  wrong chrome), 'static' when unset/unparseable/storage-less. */
  readonly mode = signal<MenuBarMode>(this.load());

  /** Auto-mode only: TRUE after the user dismissed the bar; cleared by fresh
   *  content ({@link reveal}) or by switching modes. Ignored in static mode. */
  readonly dismissed = signal(false);

  /** Switch modes and persist the pick. Any switch clears a standing dismissal:
   *  entering auto starts from the honest content-driven state, and returning
   *  to static must SHOW the bar — a stale dismissed flag must never leak into
   *  a later auto session. */
  setMode(mode: MenuBarMode): void {
    this.mode.set(mode);
    this.dismissed.set(false);
    try {
      localStorage.setItem(MENU_BAR_MODE_KEY, mode);
    } catch {
      // Private-browsing / storage-disabled: the pick still applies this visit.
    }
  }

  /** Flip static <-> auto (the floating chrome toggle's click handler). */
  toggleMode(): void {
    this.setMode(this.mode() === 'static' ? 'auto' : 'static');
  }

  /** Auto-mode: hide the bar until fresh content re-earns it. */
  dismiss(): void {
    this.dismissed.set(true);
  }

  /** Fresh content arrived — a standing dismissal is over. */
  reveal(): void {
    this.dismissed.set(false);
  }

  private load(): MenuBarMode {
    try {
      return parseMenuBarMode(localStorage.getItem(MENU_BAR_MODE_KEY)) ?? 'static';
    } catch {
      return 'static';
    }
  }
}
