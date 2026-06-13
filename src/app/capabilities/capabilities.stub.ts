import { signal } from '@angular/core';

/**
 * Test double for CapabilitiesService. `installed(slug)` reads a mutable set so a
 * spec can flip a service between installed and absent; `load()` is a no-op (no
 * HttpClient needed). Default = everything installed, so existing menu specs that
 * predate install-state gating keep their "registered => enabled" assumptions.
 */
export class CapabilitiesStub {
  /** Mutable installed-slug set. Defaults to the optional services the host knows. */
  readonly installedSlugs = signal<Set<string>>(
    new Set(['matrix', 'mastodon', 'forum', 'games', 'tube', 'owncast']),
  );
  readonly loaded = signal(true);
  readonly loadError = signal('');

  installed(slug: string): boolean {
    return this.installedSlugs().has(slug);
  }

  /** Convenience: mark a single slug absent (uninstalled) for a test. */
  setAbsent(slug: string): void {
    const next = new Set(this.installedSlugs());
    next.delete(slug);
    this.installedSlugs.set(next);
  }

  load(): Promise<void> {
    return Promise.resolve();
  }
}
