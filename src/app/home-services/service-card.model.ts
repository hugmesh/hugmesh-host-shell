/**
 * View-model for ONE home-services launcher card. A card is either ENABLED (a real
 * link to its route) or DISABLED with a helptext REASON — and the two disabled
 * kinds are distinct so the host can explain WHY (defense-in-depth: grey + EXPLAIN,
 * never hide a deployment-absent or role-gated service):
 *
 *  - kind 'absent'        — an OPTIONAL service NOT installed on this deployment
 *                           (federation capability missing/disabled). Reason:
 *                           "not available on this deployment".
 *  - kind 'role'          — a role-gated card the current principal LACKS (admin /
 *                           mod, or sign-in for any service). Reason: "sign in as …".
 *  - kind 'registration'  — installed social service, but the session isn't fully
 *                           registered yet. Reason: "complete your registration".
 *  - kind 'enabled'       — usable now: rendered as a real link.
 */
export type CardState = 'enabled' | 'absent' | 'role' | 'registration';

export interface ServiceCard {
  /** Stable id / test hook (matrix, mastodon, forum, games, tube, owncast, admin,
   *  mod). */
  readonly id: string;
  /** Visible label. */
  readonly label: string;
  /** Short descriptive sub-line. */
  readonly description: string;
  /** Router path to navigate to when enabled. */
  readonly route: string;
  /** Current state — drives link-vs-disabled rendering. */
  readonly state: CardState;
  /** Helptext explaining a disabled state (empty when enabled), wired via
   *  aria-describedby on the disabled card. */
  readonly disabledReason: string;
}
