/**
 * WHO MAY USE THE SOCIAL SERVICES (Matrix, Mastodon, Forum) — defined ONCE.
 *
 * Every client surface that offers or admits one of these services reads the
 * predicate from here: the route guards (matrix.guard.ts, mastodon.guard.ts,
 * forum.guard.ts), the /home launcher cards (home-services.service.ts), and the
 * menubar entries plus the /user home cards (menu.component.ts). A predicate that
 * lives in one place cannot drift between "the card says enabled" and "the guard
 * refuses", and the owner decision below becomes a one-line change.
 *
 * Each predicate MIRRORS THE LAYER THAT ENFORCES, not the friendliest one:
 *
 *   matrix   = fully registered AND ROLE_MATRIX
 *              hugmesh-user-bff-api hsproxy/MatrixProxyController is
 *              `@PreAuthorize("hasRole('MATRIX')")` over every /bff/user/matrix/**
 *              call the remote makes, and its RoleHierarchy has NO edge into
 *              ROLE_MATRIX (only SUPERADMIN > ADMIN|MOD|USER), so admin, mod and
 *              superadmin are refused there too. Registration stays: it is what
 *              mints the per-service token the hsproxy injects.
 *   mastodon = fully registered AND ROLE_MASTODON (MastodonProxyController, same shape).
 *   forum    = ROLE_FORUM, OR admin, OR superadmin
 *              hugmesh-gateway CanonicalSeed: `/social/forum/**` -> ROLE_FORUM, and
 *              GatewayRouteAccessFilter lets ADMIN through within its own domain and
 *              SUPERADMIN everywhere. No registration term: the forum reuses the
 *              native identity and the gateway row asks for none.
 *
 * The old client rule was looser on all three (Matrix/Mastodon: registration only;
 * Forum: any signed-in user). The shell therefore offered, enabled and mounted
 * services the backend then refused: the Matrix and Mastodon remotes booted into a
 * wall of 403s from the hsproxy and the connected-clients probe, and the Forum card
 * did nothing at all — the gateway 403'd /social/forum/remoteEntry.json, native
 * federation threw, and the user stayed on /user with no notice.
 *
 * OWNER DECISION STILL OPEN: the gateway seed ALSO admits ROLE_MOD on
 * /social/matrix/** and /social/mastodon/** (CanonicalSeed.java, the "social SPA
 * shells" rows), while the user-bff refuses MOD. These predicates follow the BFF,
 * which is what decides whether the chat and timeline actually work. One visible
 * cost: a moderator without ROLE_MATRIX can no longer reach the Matrix remote's
 * own 'moderation' page (it talks to mod-bff, not the hsproxy). If the owner grants
 * MOD at the BFF instead, add the moderator term to {@link holdsMatrixRole} /
 * {@link holdsMastodonRole} and every surface follows.
 *
 * These are defence-in-depth only. The gateway and the BFFs are the authorization;
 * this keeps the shell from advertising, or loading, what they will refuse.
 */

/** The session members the predicates read. SessionService satisfies it
 *  structurally (its computed signals are callable), and so does every spec stub
 *  that already models these flags, so callers pass the session as-is. */
export interface SocialAccessSession {
  fullyRegistered(): boolean;
  hasRole(role: string): boolean;
  isAdmin(): boolean;
  isSuperadmin(): boolean;
}

/** The ROLE half of the Matrix rule — ROLE_MATRIX, nothing implied. Split out so
 *  a disabled entry can say WHICH condition is missing (role vs registration). */
export function holdsMatrixRole(session: SocialAccessSession): boolean {
  return session.hasRole('matrix');
}

/** The ROLE half of the Mastodon rule — ROLE_MASTODON, nothing implied. */
export function holdsMastodonRole(session: SocialAccessSession): boolean {
  return session.hasRole('mastodon');
}

/** May this session use Matrix? Mirrors user-bff MatrixProxyController. */
export function canUseMatrix(session: SocialAccessSession): boolean {
  return session.fullyRegistered() && holdsMatrixRole(session);
}

/** May this session use Mastodon? Mirrors user-bff MastodonProxyController. */
export function canUseMastodon(session: SocialAccessSession): boolean {
  return session.fullyRegistered() && holdsMastodonRole(session);
}

/** May this session open the Forum? Mirrors the gateway's /social/forum/** row
 *  (ROLE_FORUM) plus its admin (own-domain) and superadmin bypasses. */
export function canUseForum(session: SocialAccessSession): boolean {
  return session.hasRole('forum') || session.isAdmin() || session.isSuperadmin();
}
