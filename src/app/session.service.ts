import { Injectable, signal, computed } from '@angular/core';

/** The host shell's three federated role-homes. Derived from the Casdoor role
 *  claims with admin > mod > user precedence (an admin who also has 'user' still
 *  lands on the admin role-home). Drives the default route's role-home redirect
 *  and the conditional Admin/Moderation profile-menu entries. */
export type ShellRole = 'admin' | 'mod' | 'user';

/** A principal's access status. LIVE (server-fed, host-enforced short-circuit):
 *  the admin-bff surfaces `status` (active|suspended|banned) on BOTH
 *  `POST /bff/login` and `GET /bff/me` (the merged AuthController/AccountStatus
 *  contract — see `account-status/account-status.model.ts`). The login remote
 *  refuses to store a curtailed session at sign-in (it routes to
 *  `/login/appeal?reason=<text>` pre-session); a curtailment landing MID-SESSION
 *  reaches this field via the host's authoritative `/bff/me` re-read
 *  ({@link import('./account-status/account-status.service').AccountStatusService}
 *  syncs the normalized status back here), and `roleHomeGuard` short-circuits a
 *  suspended/banned session to the appeal page BEFORE the role-home redirect.
 *  Defaults to 'active' when absent (older writers / fail-open reads). */
export type AccessStatus = 'active' | 'suspended' | 'banned';

export interface SnapSession {
  id: string;                 // casdoor identity, e.g. google:alice@gmail.com
  label: string;              // display (email or discord handle)
  /** How the identity signed in. The social remotes persist 'google'/'discord';
   *  the native-login flow (our-UI password + Casdoor-internal OIDC) surfaces
   *  'password'/'oidc' on GET /bff/session, so the union carries both families. */
  provider: 'google' | 'discord' | 'password' | 'oidc';
  roles: string[];
  registrationComplete: boolean;
  /** Server-fed access status — see {@link AccessStatus}. Absent => 'active'. */
  status?: AccessStatus;
}

/** The GET /bff/session response body — the SAME projection login-ui #51 and
 *  matrix-ui #44 hydrate from. `id`, `roles` and `registrationComplete` are the
 *  authoritative identity/authorization fields; `label`/`provider` are optional
 *  (a native password / OIDC session may omit the social display fields). Note it
 *  carries NO `status` — that stays owned by GET /bff/me (AccountStatusService). */
export interface SessionResponse {
  id: string;
  label?: string;
  provider?: SnapSession['provider'];
  roles?: string[];
  registrationComplete?: boolean;
}

/** Same-origin front-door endpoint carrying the authoritative session for the
 *  HttpOnly session cookie. Relative (the host reads no runtime globals and is
 *  served same-origin behind the gateway), cookie-carrying, dev + prod alike. */
export const SESSION_ENDPOINT = '/bff/session';

/** Same-origin REAL logout. POSTing here deletes the opaque {@code bff_session} row (so the
 *  token stops resolving), EXPIRES the session cookie, and best-effort revokes the subject's
 *  Matrix/Mastodon homeserver localparts at the gateway — see admin-bff {@code AuthController
 *  #sessionOut}. CSRF-exempt server-side (it is one of the cookie-mint endpoints), so no token
 *  is echoed. This is the SAME endpoint login-ui's SessionService.clear() posts to. */
export const SESSION_OUT_ENDPOINT = '/bff/sessionOut';

/** Holds the logged-in session (persisted to localStorage under the canonical
 *  "hug.session" key the login remote writes) and derives the Casdoor-style role
 *  flags + the registration-complete gate the host uses to unlock the
 *  Matrix/Mastodon micro-frontends, plus the admin/mod role routing of Phase 10.
 *
 *  This is the SAME contract used VERBATIM by login-ui, admin-ui and the matrix
 *  reference host. In-session role STRINGS are lowercase ('admin','mod','user');
 *  the ROLE_ADMIN/ROLE_MOD/ROLE_USER names are the Casdoor labels behind them. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly key = 'hug.session';
  /** The CANONICAL same-document session-change seam: 'hug-session-change' — the
   *  name every federated remote's SessionService listens on (login-ui, admin-ui,
   *  mod-ui, matrix-ui, mastodon-ui, forum-ui, wiki-ui, tube-ui, owncast-ui,
   *  user-mesh-ui all declare this exact string), and the name this repo's own
   *  ViewReloadService / NotificationToastService docs already cite as "the seam
   *  SessionService uses".
   *
   *  The host USED to broadcast AND listen on the pre-rebrand
   *  'snap-session-change' name, which NO remote (except hugmesh-user-ui, carrying
   *  the same stale string) ever listens on. Same-document `storage` events do NOT
   *  fire in the tab that wrote, so the broadcast is the ONLY way a mounted
   *  remote learns the session changed — and Sign out's broadcast therefore never
   *  reached 10 of the 11 remotes: their in-memory session signals kept rendering
   *  the signed-out user's identity and role surfaces until a full page reload
   *  (operator report 2026-08-19, "need to clear cache every time after log out"). */
  private readonly channel = 'hug-session-change';
  /** The legacy pre-rebrand channel name. Still DISPATCHED (never listened on)
   *  so a not-yet-redeployed remote that only knows the old name — hugmesh-user-ui
   *  before its matching rename — still hears sign-in/sign-out during a
   *  mixed-version rollout. Remove once every deployed remote listens on the
   *  canonical channel. */
  private readonly legacyChannel = 'snap-session-change';
  readonly session = signal<SnapSession | null>(this.load());
  readonly loggedIn = computed(() => this.session() !== null);
  readonly isAdmin = computed(() => (this.session()?.roles ?? []).includes('admin'));
  /** Moderator TIER -> the /mod role-home (hugmesh-mod-ui remote).
   *
   *  'admin' and 'superadmin' count, not just 'mod'. This is NOT a claim that
   *  ADMIN implies MOD — admin-bff and mod-bff both deliberately document them as
   *  SIBLINGS with no ADMIN > MOD hierarchy edge, and that stays true. It is that
   *  every ENFORCEMENT layer already grants the admin tier this specific surface
   *  explicitly:
   *    - mod-bff ModController: @PreAuthorize("hasAnyRole('MOD','ADMIN')") on the
   *      ban / block / domain-lock verbs
   *    - mod-bff SecurityConfig: /bff/mod/** -> hasAnyRole("MOD","ADMIN","SUPERADMIN")
   *    - gateway route-access: /mod/** and /bff/mod/** each carry ROLE_MOD AND
   *      ROLE_ADMIN rows
   *    - hugmesh-mod-ui's own SessionService: roles.includes('mod') || includes('admin')
   *  This predicate was the ONLY layer disagreeing, and it is the one that decides
   *  what the operator can SEE: menu.component.ts hides the Moderation entry unless
   *  isMod(), and modGuard bounces /mod on the same signal. So an ADMIN or
   *  SUPERADMIN without a literal 'mod' role was locked out of the Matrix and
   *  Mastodon moderation console — the ban / block / domain-lock surface — which
   *  reads as "the admin controls for Matrix and Mastodon don't exist" when they
   *  are built and merely unreachable. Widening this grants no new privilege. */
  readonly isMod = computed(() => {
    const roles = this.session()?.roles ?? [];
    return roles.includes('mod') || roles.includes('admin') || roles.includes('superadmin');
  });
  /** Superadmin role (cross-domain manage-all, sits ABOVE admin in the cascade
   *  SUPERADMIN > ADMIN > MOD > USER). Lowercase 'superadmin' role string, mirroring
   *  isAdmin/isMod. Used by service guards that grant superadmins unconditional
   *  access (e.g. the wiki management remote: superadmin manages ALL wiki features). */
  readonly isSuperadmin = computed(() => (this.session()?.roles ?? []).includes('superadmin'));
  /** GAMES entry-point role (Phase 8): plain ROLE_GAMES grants access to the games
   *  namespace ENTRY-POINT ONLY — it does NOT by itself grant games ADMIN (see
   *  {@link isGamesAdmin}). Lowercase 'games' role string, mirroring isAdmin/isMod. */
  readonly isGames = computed(() => (this.session()?.roles ?? []).includes('games'));
  /** GAMES-ADMIN role (Phase 8/10): mirrors the server-computed DERIVED role
   *  materialized by manifests/casdoor/games-admin-sync-job.yaml —
   *      ROLE_GAMES_ADMIN = ROLE_GAMES ∩ (ROLE_ADMIN ∪ ROLE_MOD)
   *  — i.e. ROLE_GAMES_ADMIN is NEVER granted directly; it is earned by holding
   *  ROLE_GAMES together with either ROLE_ADMIN or ROLE_MOD. A bare ROLE_GAMES
   *  (e2e-gamesonly) or a bare ROLE_ADMIN (e2e-adminonly) must NOT earn it
   *  (default-deny). This client-side derivation is defence-in-depth only — the
   *  sync job + gateway route-access rows are the real authorization boundary —
   *  so it must never grant a tier the server wouldn't also grant. */
  readonly isGamesAdmin = computed(() => this.isGames() && (this.isAdmin() || this.isMod()));
  /** Every authenticated identity is at least a ROLE_USER (the user role-home is
   *  the baseline). True for any logged-in session even when the explicit 'user'
   *  role string is absent, so the default route always resolves a role-home. */
  readonly isUser = computed(() => this.loggedIn());
  /** The current session's effective role-home, admin > mod > user. Null when no
   *  one is signed in (the shell then renders the login flow). The default ('')
   *  route's resolver redirects to `/${role()}`. */
  readonly role = computed<ShellRole | null>(() => {
    if (!this.loggedIn()) return null;
    if (this.isAdmin()) return 'admin';
    if (this.isMod()) return 'mod';
    return 'user';
  });
  /** Matrix/Mastodon are usable only after full registration completes. */
  readonly fullyRegistered = computed(() => this.session()?.registrationComplete === true);
  /** The session's access status ('active' when absent/anonymous — fail-open,
   *  matching the account-status model's graceful degrade). Populated from the
   *  server truth: the login remote's `/bff/login` write and the host's
   *  authoritative `/bff/me` re-read (AccountStatusService syncs it here), so
   *  `roleHomeGuard` can short-circuit a suspended/banned session to the appeal
   *  page synchronously (no HTTP in the guard). */
  readonly status = computed<AccessStatus>(() => this.session()?.status ?? 'active');
  /** True for the two curtailed states the guard short-circuits on. */
  readonly curtailed = computed(() => {
    const s = this.status();
    return s === 'suspended' || s === 'banned';
  });

  /** Does the session carry the given PER-SERVICE access role? The role-home
   *  flags (admin/mod/user) are the broad cascade tiers; a SERVICE sub-role like
   *  ROLE_WIKI (sibling of ROLE_FORUM) is an additional opt-in grant that lets a
   *  MOD reach a service the cascade alone would not (e.g. WIKI_READ =
   *  ADMIN|SUPERADMIN|(MOD+ROLE_WIKI)). The Casdoor label is ROLE_<NAME>; the
   *  in-session role STRINGS are lowercase ('wiki'), so we match case-insensitively
   *  on either the bare name or the lowercase form — robust to either casing the
   *  login remote happens to persist. Reads the reactive `session` signal so guards
   *  and the menu re-evaluate when the session changes. */
  hasRole(role: string): boolean {
    const want = role.toLowerCase();
    return (this.session()?.roles ?? []).some((r) => r.toLowerCase() === want);
  }

  constructor() {
    // The host shell and each federated remote each hold their OWN SessionService
    // instance over the same localStorage key. Stay in sync so every nav/guard
    // reading this signal sees the current session — e.g. the login remote
    // completing registration must unlock the host shell's Matrix/Mastodon nav.
    if (typeof window !== 'undefined') {
      // A same-document broadcast (this or a sibling in-page SessionService wrote
      // the mirror, or AccountStatusService synced status) means the session MAY
      // have changed — do an AUTHORITATIVE re-read from /bff/session, not just a
      // localStorage mirror re-read, so a mid-session role grant/revoke is picked
      // up. hydrate() never writes the mirror nor broadcasts, so this can't loop.
      window.addEventListener(this.channel, () => void this.hydrate());
      // A cross-TAB write to hug.session: the sibling tab already hydrated and
      // wrote the mirror, so re-reading the mirror here (no extra BFF round-trip,
      // and no fetch in a background tab) suffices.
      window.addEventListener('storage', (e) => { if (e.key === this.key) this.session.set(this.load()); });
      // Bootstrap: the signal is already seeded synchronously from the localStorage
      // mirror (field initializer above — no anonymous flash); now confirm/refresh
      // it against /bff/session so a role changed since the mirror was written — or
      // a cookie-only session with no mirror at all — renders without a re-login.
      void this.hydrate();
    }
  }

  /**
   * Refresh the in-memory session from the authoritative GET /bff/session — the
   * SAME hydrate login-ui #51 and matrix-ui #44 ship, ported to the host shell so
   * a role granted/revoked MID-SESSION (or a true cookie-only session with no
   * localStorage mirror at all) is reflected without a re-login.
   *
   * On 200 it maps the body into SnapSession and updates the in-memory signal
   * ONLY: it NEVER writes localStorage and NEVER broadcasts. login-ui owns the
   * persisted `hug.session` mirror; a host write + broadcast would ping-pong with
   * it (and the broadcast re-enters this very hydrate). `status` is owned by GET
   * /bff/me (AccountStatusService) and is not carried on /bff/session, so the
   * current in-memory status is preserved rather than reset.
   *
   * On ANY failure — a network error OR a non-2xx (INCLUDING a 401) OR an
   * unusable body — it falls back to `this.session.set(this.load())` and returns
   * null. e2e harnesses / mock stacks seed localStorage with no live BFF, so a
   * failed probe must NEVER clobber a seeded session; the trade-off is that an
   * expired-cookie 401 keeps the stale mirror (no regression — this freshness is
   * purely additive over the old load-only bootstrap).
   */
  async hydrate(): Promise<SnapSession | null> {
    try {
      const res = await fetch(SESSION_ENDPOINT, {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const body = (await res.json()) as SessionResponse;
      if (!body || typeof body.id !== 'string' || body.id === '') {
        throw new Error('session body missing id');
      }
      // ROLES ARE LOAD-BEARING, so an ABSENT roles array is an UNUSABLE body, exactly
      // like a missing id — not "this user has no roles".
      //
      // Every other field in fromBody falls back to its current value; roles could not,
      // because a genuinely EMPTY array has to mean revocation (that is the whole point
      // of hydrating: "a role granted/revoked MID-SESSION is reflected without a
      // re-login"). That left absent and empty indistinguishable, so any 200 whose body
      // omitted or renamed the field silently downgraded a live session to no roles —
      // the menu would empty out and every console would start refusing, with a
      // successful request as the only trace.
      //
      // Failing here routes it into the catch below, which restores the localStorage
      // mirror rather than dropping to anonymous. So: empty => honoured as revocation;
      // absent => rejected as malformed.
      if (!Array.isArray(body.roles)) {
        throw new Error('session body missing roles');
      }
      const next = this.fromBody(body);
      this.session.set(next);
      return next;
    } catch {
      // See the doc-comment: a failed probe (offline, mock stack with no BFF, or
      // an expired-cookie 401) must never wipe a seeded/known session — re-read
      // the localStorage mirror instead of dropping to anonymous.
      this.session.set(this.load());
      return null;
    }
  }

  /** Map the /bff/session body onto SnapSession: identity + roles + registration
   *  come from the authoritative body; the optional display fields fall back to
   *  the last-known values; `status` is left to its owner (/bff/me), so the
   *  current in-memory value is carried forward untouched. */
  private fromBody(body: SessionResponse): SnapSession {
    const current = this.session();
    return {
      id: body.id,
      label: body.label ?? current?.label ?? body.id,
      provider: body.provider ?? current?.provider ?? 'oidc',
      roles: Array.isArray(body.roles) ? body.roles : [],
      registrationComplete: body.registrationComplete === true,
      status: current?.status,
    };
  }

  private load(): SnapSession | null {
    try { const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  set(s: SnapSession): void { localStorage.setItem(this.key, JSON.stringify(s)); this.session.set(s); this.broadcast(); }
  patch(p: Partial<SnapSession>): void { const s = this.session(); if (s) this.set({ ...s, ...p }); }
  /**
   * Sign out. EXPIRES THE SERVER SESSION FIRST, and AWAITS it.
   *
   * <p>This used to drop client state only — which did not log anyone out. The HttpOnly
   * {@code bff_session} cookie survived, and {@link #broadcast} below re-enters
   * {@link #hydrate}, which re-reads {@link SESSION_ENDPOINT} WITH that still-valid cookie,
   * gets a 200, and puts the session straight back. Signing out therefore left you able to
   * navigate, left your id in the menubar, left the service entries listed and never showed
   * the login screen — because the session had genuinely been RESTORED, not merely left on
   * screen. Nothing was stale; it was live again a tick later.
   *
   * <p>Best-effort on the RESULT (an already-dead cookie 401s, an offline browser throws —
   * neither may strand the user signed-in locally) but NOT on the ORDER: the {@code await} is
   * the whole fix. It guarantees the cookie is dead before anything can re-read it, so the
   * hydrate that our own broadcast triggers resolves to "not logged in".
   */
  async clear(): Promise<void> {
    try {
      await fetch(SESSION_OUT_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
    } catch {
      // Deliberately swallowed — local sign-out must still happen when the network is down.
    }
    localStorage.removeItem(this.key);
    this.session.set(null);
    this.broadcast();
  }
  /** Notify the other in-page SessionService instances (host + remotes) to
   *  re-read. Dispatched on the canonical channel every remote listens on, AND on
   *  the legacy pre-rebrand name so a not-yet-redeployed remote still hears it
   *  (see {@link legacyChannel}). The host itself listens ONLY on the canonical
   *  channel, so its own broadcast triggers exactly one authoritative re-hydrate. */
  private broadcast(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(this.channel));
    window.dispatchEvent(new Event(this.legacyChannel));
  }
}
