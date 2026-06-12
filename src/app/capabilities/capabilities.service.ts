import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { FederationCapability } from './capability.model';

/** PUBLIC (permitAll) federation-api install-state projection. Relative path so the
 *  id/fe-gateway routes `/api/*` to federation-api with the session cookie in dev
 *  and prod alike; `federationApiBase` is '' (same-origin) today but kept
 *  configurable for a future cross-origin host. */
export const CAPABILITIES_ENDPOINT = `${environment.federationApiBase}/api/federation/capabilities`;

/**
 * Loads + holds the PUBLIC federation capability list (install-state) the host
 * uses to grey-out absent/disabled OPTIONAL services. Modelled on
 * AnnouncementsService (signal store + indirected fetcher) but:
 *  - reads a PUBLIC endpoint, so it loads for ANONYMOUS sessions too (the greying
 *    must work logged-out — that is the whole point of the public projection); and
 *  - NEVER hard-fails: a network/HTTP error leaves an EMPTY capability map, which
 *    the predicates read as "nothing known installed" → services grey out by
 *    absence rather than the shell breaking (defense-in-depth graceful degrade).
 *
 * `installed(slug)` is the single predicate the menu + the home-services cards
 * read. An UNKNOWN slug (absent from the list, e.g. never registered or the fetch
 * failed) is reported NOT installed — greyed, never a dead link.
 */
@Injectable({ providedIn: 'root' })
export class CapabilitiesService {
  private readonly http = inject(HttpClient);

  /** Raw capability list as last fetched (empty until load() / on any failure). */
  private readonly all = signal<readonly FederationCapability[]>([]);
  /** Non-empty after a fetch failed; surfaced only to logs, never to the user. */
  readonly loadError = signal('');

  /** slug -> installed, derived once per fetch for O(1) predicate reads. */
  private readonly bySlug = computed<ReadonlyMap<string, boolean>>(() => {
    const map = new Map<string, boolean>();
    for (const c of this.all()) map.set(c.slug, c.installed);
    return map;
  });

  /** Whether the host has loaded a capability list yet (success OR failure). Lets
   *  the UI distinguish "still loading" from "loaded, service absent". */
  readonly loaded = signal(false);

  /**
   * Whether an OPTIONAL service is installed AND serveable right now. An UNKNOWN
   * slug — never registered, or unreachable because the fetch failed — is reported
   * NOT installed, so the host greys it out (by absence) rather than offering a
   * dead link. A registered-but-disabled service reports false too (by state).
   */
  installed(slug: string): boolean {
    return this.bySlug().get(slug) === true;
  }

  /** In-flight / completed load, so multiple init callers (menu + home cards)
   *  share ONE fetch instead of each issuing its own. */
  private inFlight: Promise<void> | null = null;

  /**
   * Fetch the public capability list ONCE (shared across callers). Both the menu
   * (always mounted) and the home-services cards call this on init; the first call
   * fetches and the rest await the same promise. Pass {@code force:true} to
   * re-fetch (e.g. after an admin install/uninstall) — otherwise it's a no-op once
   * loaded. Resolves WITHOUT throwing on any error (records loadError, leaves the
   * list empty) so a federation-api outage greys services out instead of breaking
   * the shell. Safe for anonymous and authenticated sessions alike.
   */
  load(force = false): Promise<void> {
    if (this.inFlight && !force) return this.inFlight;
    this.inFlight = this.fetch();
    return this.inFlight;
  }

  private async fetch(): Promise<void> {
    try {
      const items = await firstValueFrom(
        this.http.get<FederationCapability[]>(CAPABILITIES_ENDPOINT),
      );
      this.all.set(Array.isArray(items) ? items : []);
      this.loadError.set('');
    } catch (err) {
      this.all.set([]);
      this.loadError.set(err instanceof Error ? err.message : 'capabilities load failed');
    } finally {
      this.loaded.set(true);
    }
  }
}
