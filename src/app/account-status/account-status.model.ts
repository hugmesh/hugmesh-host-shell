/**
 * The caller's OWN account-state, as surfaced on the admin-bff responses
 * {@code GET /bff/me} and {@code POST /bff/login} (the merged AuthController /
 * AccountStatus contract). It is BFF-COMPUTED off the access_suspension
 * desired-state — informational only, NOT an authorization gate (the real
 * enforcement is at the token broker + gateway).
 *
 * Shape (mirrors admin-bff `AccountStatus.putStatus`):
 *  - `status` is ALWAYS present, one closed set: active | suspended | banned.
 *  - `until` (ISO-8601 instant) is added only when the curtailment expires
 *    (a timed suspension); absent for `active` and for a permanent `banned`.
 *  - `reason` (free text) is added only when an audit reason was recorded.
 *
 * GRACEFUL DEGRADE: when the field is ABSENT entirely (an older BFF, or a
 * fail-open read error) the host treats the caller as {@link ACTIVE} — the
 * appeal-gate is informational, never a hard block.
 */
export type AccessStatusValue = 'active' | 'suspended' | 'banned';

export const ACTIVE = 'active' as const;
export const SUSPENDED = 'suspended' as const;
export const BANNED = 'banned' as const;

/** The status projection the host reads off /bff/me (the only fields it needs). */
export interface AccountStatus {
  /** active | suspended | banned. Always present on a well-formed response. */
  status: AccessStatusValue;
  /** ISO-8601 instant the curtailment lifts; null/absent = no expiry. */
  until?: string | null;
  /** Optional audit reason shown to the curtailed caller; null/absent = none. */
  reason?: string | null;
}

/** The fully-usable default — what an absent/unknown status degrades to. */
export const ACTIVE_STATUS: AccountStatus = { status: ACTIVE };

/** True only for the two states that curtail the account (suspended | banned).
 *  `active` and any UNKNOWN/garbage value are treated as NOT curtailed so the
 *  gate fails OPEN (informational, never a block). */
export function isCurtailed(status: AccountStatus | null | undefined): boolean {
  const s = status?.status;
  return s === SUSPENDED || s === BANNED;
}

/** Coerce an arbitrary BFF body into a well-formed AccountStatus, degrading any
 *  missing/unrecognised status to `active`. Defensive: the host never trusts the
 *  wire shape blindly (a non-object, a missing field, or an unknown status string
 *  all collapse to active). */
export function normalizeStatus(body: unknown): AccountStatus {
  if (!body || typeof body !== 'object') return { ...ACTIVE_STATUS };
  const raw = body as Record<string, unknown>;
  const value = raw['status'];
  const status: AccessStatusValue =
    value === SUSPENDED || value === BANNED ? value : ACTIVE;
  const out: AccountStatus = { status };
  if (typeof raw['until'] === 'string' && raw['until'].length) out.until = raw['until'];
  if (typeof raw['reason'] === 'string' && raw['reason'].length) out.reason = raw['reason'];
  return out;
}
