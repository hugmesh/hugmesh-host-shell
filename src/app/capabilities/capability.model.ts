/**
 * Wire shape of one entry from the PUBLIC federation-api projection
 * `GET /api/federation/capabilities` (permitAll). One descriptor per REGISTERED
 * federation module, ordered by slug. This is the install-state list the host
 * uses to GREY-OUT optional services (matrix / mastodon / forum / games) that are
 * absent or disabled — deliberately distinct from the authed, visibility-filtered
 * `/api/federation/manifest` (which a logged-out / non-admin host can't read).
 *
 * Contract (federation-api CapabilityDto): slug + installed + mountAt +
 * requiresRole ONLY — no remoteEntryUrl / exposedModule / visibility / owner /
 * other internal locator-detail.
 *
 *  - `installed` = the row exists AND is enabled AND circuit-closed (serveable now).
 *    A registered-but-disabled / circuit-broken service appears with
 *    installed=false (grey it out by STATE); a NEVER-registered optional service is
 *    ABSENT from the list entirely (grey it out by ABSENCE).
 *  - `mountAt` / `requiresRole` are the only two metadata fields surfaced; either
 *    may be null when the module's metadata omitted it (null-safe by construction).
 */
export interface FederationCapability {
  readonly slug: string;
  readonly installed: boolean;
  readonly mountAt: string | null;
  readonly requiresRole: string | null;
}
