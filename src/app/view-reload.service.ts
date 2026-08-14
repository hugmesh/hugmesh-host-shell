import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** The window event every federated remote may listen for to re-fetch its own
 *  data WITHOUT being torn down. Named on `window` (not an Angular service)
 *  deliberately: a native-federation remote gets its OWN injector, so a shell
 *  service instance is simply not reachable from inside matrix-ui/mastodon-ui —
 *  the shared `window` is the only seam the two sides genuinely have in common
 *  (the same seam SessionService already uses for its cross-instance
 *  'hug-session-change' broadcast). */
export const VIEW_RELOAD_EVENT = 'hug:view-reload';

/**
 * The shell's RELOAD control. Refreshes whatever is currently in the
 * router-outlet — including a federated remote — WITHOUT a full browser reload
 * where that is possible, because a full reload costs the whole
 * native-federation bootstrap (remoteEntry fetches, shared-scope init, the
 * remotes' own module graph) and throws away the shell's warm session state.
 *
 * Three escalating steps, cheapest first:
 *
 *  1. BROADCAST `hug:view-reload` on `window`. A remote that listens can simply
 *     re-run its own fetches (matrix-ui re-reads the room list, mastodon-ui
 *     re-reads the timeline), which is the least disruptive refresh there is —
 *     no component teardown, no scroll-position loss, no re-mount flash.
 *  2. RE-NAVIGATE through the router to the SAME url via a throwaway
 *     `skipLocationChange` hop, which destroys and re-creates the routed
 *     component tree. This is what actually re-mounts a remote whose view is
 *     wedged (a failed initial load, a stale guard result) — the broadcast
 *     alone cannot fix a component that never rendered.
 *  3. FULL RELOAD (`location.reload()`) if the re-navigation REJECTS. A router
 *     navigation can be rejected by a guard or blow up inside a remote's route
 *     resolution, and the one thing worse than a slow reload is a Reload button
 *     that silently does nothing.
 *
 * `busy` is exposed so the button can render `aria-busy` + a disabled state for
 * the (usually sub-frame) duration, so the control never looks inert on a slow
 * remote.
 */
@Injectable({ providedIn: 'root' })
export class ViewReloadService {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);

  /** True while a reload is in flight (drives aria-busy on the trigger). */
  readonly busy = signal(false);

  /** Monotonic counter of completed reloads — the testable observable effect of
   *  step 1/2, and a hook a shell-side component can react to if it ever needs
   *  one. */
  readonly reloadCount = signal(0);

  async reload(): Promise<void> {
    if (this.busy()) { return; }
    this.busy.set(true);
    try {
      // Step 1 — let any listening remote refresh in place first. Dispatched
      // BEFORE the re-navigation so a remote that can self-refresh has already
      // started; a remote that also gets re-created simply drops the listener.
      this.broadcast();

      // Step 2 — re-mount the routed view. `skipLocationChange` on the hop keeps
      // the throwaway url out of the history stack, so the user's Back button
      // still goes where they expect.
      const url = this.router.url;
      await this.router.navigateByUrl('/', { skipLocationChange: true });
      await this.router.navigateByUrl(url);

      this.reloadCount.update((n) => n + 1);
    } catch {
      // Step 3 — the router refused (guard rejection, a remote that threw during
      // route resolution). Fall back to the blunt instrument rather than leaving
      // the user with a button that appears to do nothing.
      this.hardReload();
    } finally {
      this.busy.set(false);
    }
  }

  /** Dispatch the cross-remote refresh signal. Guarded for a non-browser
   *  (SSR/test) document, where `defaultView` is null. */
  private broadcast(): void {
    const win = this.doc.defaultView;
    if (!win) { return; }
    win.dispatchEvent(new CustomEvent(VIEW_RELOAD_EVENT, { detail: { at: Date.now() } }));
  }

  /** The full-browser-reload fallback, isolated so a test can assert the
   *  fallback fires without actually navigating the karma runner away. */
  protected hardReload(): void {
    this.doc.defaultView?.location.reload();
  }
}
