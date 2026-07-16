import { Injectable, computed, inject, signal } from '@angular/core';

import { SessionService } from '../session.service';
import { HomeAnnouncement } from './announcement.model';

/** Same-origin admin-bff endpoint for the logged-in HOME top banner. The id-gateway
 *  routes `/bff/*` to the BFF, so a relative path with the HttpOnly `bff_` session
 *  cookie works in dev and prod alike (the browser holds no bearer token). */
export const HOME_ANNOUNCEMENTS_ENDPOINT = '/bff/announcements/home';

/** localStorage key holding the set of announcement ids the user has dismissed.
 *  We mirror the host's existing localStorage-backed state (SessionService) rather
 *  than a user-bff preference: this host has no preference plumbing, and the home
 *  getting-started-guide dismiss this is modelled on is itself client-persisted. */
const DISMISSED_KEY = 'snap.announcements.dismissed';

/** Indirected so unit tests can stub the network without touching native fetch. */
export const announcementsFetcher = {
  /** GET the active HOME announcements for the current session. */
  fetch: (): Promise<HomeAnnouncement[]> =>
    fetch(HOME_ANNOUNCEMENTS_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }).then((res) => {
      if (!res.ok) throw new Error(`announcements ${res.status}`);
      return res.json() as Promise<HomeAnnouncement[]>;
    }),
};

/**
 * Loads + holds the logged-in user's active HOME announcements and tracks which
 * ones they have DISMISSED (persisted to localStorage, keyed by announcement id, so
 * a dismissed banner stays gone across reloads — "dismiss once"). Only authenticated
 * sessions fetch; signing out clears the in-memory list.
 *
 * The BFF returns ONLY active, home-targeted announcements, so the service trusts it
 * for state/window/target and merely (a) re-sorts by priority defensively, (b) drops
 * any whose [starts_at, ends_at] window has — defensively — already closed, and
 * (c) filters out the locally-dismissed ids. `visible()` is the banner's render gate.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly session = inject(SessionService);

  /** Raw active home announcements as last fetched from the BFF. */
  private readonly all = signal<HomeAnnouncement[]>([]);
  /** The set of locally-dismissed announcement ids (persisted). */
  private readonly dismissed = signal<ReadonlySet<string>>(this.loadDismissed());
  /** Non-empty after a fetch failed; surfaced only to logs, never to the user. */
  readonly loadError = signal('');

  /** The announcements to actually render: active window, not dismissed, priority
   *  desc (then a stable id tiebreak). Empty when signed out — the banner hides. */
  readonly visible = computed<readonly HomeAnnouncement[]>(() => {
    if (!this.session.loggedIn()) return [];
    const dismissed = this.dismissed();
    const now = Date.now();
    return this.all()
      .filter((a) => !dismissed.has(a.id) && this.withinWindow(a, now))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  });

  /** Fetch (or refresh) the active home announcements. No-op (and clears the list)
   *  for anonymous sessions, so the banner never shows to logged-out visitors. */
  async load(): Promise<void> {
    if (!this.session.loggedIn()) {
      this.all.set([]);
      return;
    }
    try {
      const items = await announcementsFetcher.fetch();
      this.all.set(Array.isArray(items) ? items : []);
      this.loadError.set('');
    } catch (err) {
      this.all.set([]);
      this.loadError.set(err instanceof Error ? err.message : 'announcements load failed');
    }
  }

  /** Permanently dismiss an announcement for this user (persisted to localStorage).
   *  No-op for a non-dismissible announcement so a pinned banner can't be hidden. */
  dismiss(id: string): void {
    const target = this.all().find((a) => a.id === id);
    if (target && !target.dismissible) return;
    const next = new Set(this.dismissed());
    next.add(id);
    this.dismissed.set(next);
    this.persistDismissed(next);
  }

  /** True while now is inside the announcement's [starts_at, ends_at] window. */
  private withinWindow(a: HomeAnnouncement, now: number): boolean {
    const startsOk = !a.starts_at || Date.parse(a.starts_at) <= now;
    const endsOk = !a.ends_at || Date.parse(a.ends_at) >= now;
    return startsOk && endsOk;
  }

  private loadDismissed(): ReadonlySet<string> {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      const ids = raw ? (JSON.parse(raw) as unknown) : [];
      return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      return new Set<string>();
    }
  }

  private persistDismissed(ids: ReadonlySet<string>): void {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
    } catch {
      // Storage unavailable (private mode / quota): dismissal still holds for this
      // session via the in-memory signal; nothing else to do.
    }
  }
}
