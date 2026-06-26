import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { SessionService } from '../session.service';
import {
  ACTIVE_STATUS,
  AccountStatus,
  isCurtailed,
  normalizeStatus,
} from './account-status.model';

/** Same-origin admin-bff endpoint carrying the caller's OWN account status. The
 *  id/fe-gateway routes `/bff/*` to the BFF, so a relative path with the HttpOnly
 *  session cookie (sent by the host bearerInterceptor's `withCredentials: true`;
 *  the gateway exchanges it for the upstream bearer server-side) works in dev and
 *  prod alike. `/bff/me` is the authoritative re-read; `/bff/login`
 *  carries the same `status` field at sign-in, but the host re-reads `/me` so a
 *  status change after login (a suspension landing mid-session) is still seen. */
export const ME_ENDPOINT = '/bff/me';

/**
 * Loads + holds the logged-in caller's OWN access status (active | suspended |
 * banned), read off {@code GET /bff/me} (same field the {@code /bff/login}
 * response carries). Drives the host appeal-gate banner.
 *
 * Modelled on {@link import('../capabilities/capabilities.service').CapabilitiesService}:
 *  - signal store + an HttpClient read through the shared credentials seam;
 *  - FAILS OPEN — this status is INFORMATIONAL, not an authz gate. A network/HTTP
 *    error, a missing field, or a malformed body all degrade to {@code active}
 *    (the banner stays hidden), so a transient `/bff/me` blip never blocks the app
 *    nor falsely accuses an active user. The real enforcement lives at the token
 *    broker + gateway; this is purely to EXPLAIN a curtailment + offer an appeal.
 *  - only AUTHENTICATED sessions read (an anonymous visitor has no own-status);
 *    signing out resets to active.
 */
@Injectable({ providedIn: 'root' })
export class AccountStatusService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);

  /** The caller's own status as last read (active until a load resolves). */
  private readonly current = signal<AccountStatus>({ ...ACTIVE_STATUS });
  /** Non-empty after a fetch failed; surfaced only to logs, never to the user
   *  (a failed read degrades to active — we never show an error to accuse them). */
  readonly loadError = signal('');
  /** Whether a status read has resolved yet (success OR failure). */
  readonly loaded = signal(false);

  /** The status the banner renders. Active (hidden banner) when signed out, or
   *  when the read degraded. */
  readonly status = computed<AccountStatus>(() =>
    this.session.loggedIn() ? this.current() : { ...ACTIVE_STATUS },
  );

  /** The single render gate the banner reads: true only for suspended | banned
   *  on a logged-in session. Active / unknown / anonymous => false => no banner. */
  readonly curtailed = computed<boolean>(
    () => this.session.loggedIn() && isCurtailed(this.current()),
  );

  /** In-flight load, so concurrent init callers share ONE fetch. */
  private inFlight: Promise<void> | null = null;

  /**
   * Read (or refresh) the caller's own status from `/bff/me`. No-op (and resets
   * to active) for anonymous sessions, so the banner never shows to logged-out
   * visitors. Resolves WITHOUT throwing on any error — a failed/garbled read
   * leaves the status `active` (fail-open). Pass {@code force:true} to re-read.
   */
  load(force = false): Promise<void> {
    if (this.inFlight && !force) return this.inFlight;
    if (!this.session.loggedIn()) {
      this.current.set({ ...ACTIVE_STATUS });
      this.loadError.set('');
      this.loaded.set(true);
      return Promise.resolve();
    }
    this.inFlight = this.fetch().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetch(): Promise<void> {
    try {
      const body = await firstValueFrom(this.http.get<unknown>(ME_ENDPOINT));
      this.current.set(normalizeStatus(body));
      this.loadError.set('');
    } catch (err) {
      // FAIL OPEN: status is informational. A transient /bff/me error must not
      // block the app nor falsely flag the user — degrade to active.
      this.current.set({ ...ACTIVE_STATUS });
      this.loadError.set(err instanceof Error ? err.message : 'status load failed');
    } finally {
      this.loaded.set(true);
    }
  }
}
