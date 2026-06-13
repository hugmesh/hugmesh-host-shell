import { Injectable, signal, computed } from '@angular/core';

/** The host shell's three federated role-homes. Derived from the Casdoor role
 *  claims with admin > mod > user precedence (an admin who also has 'user' still
 *  lands on the admin role-home). Drives the default route's role-home redirect
 *  and the conditional Admin/Moderation profile-menu entries. */
export type ShellRole = 'admin' | 'mod' | 'user';

/** A principal's access status. ADDITIVE / FORWARD-LOOKING (no enforcement yet):
 *  the appeal-on-login suspended-guard is DEFERRED — it needs a JWT status claim
 *  that `/bff/login`/`/bff/me`/the token do NOT carry today (UI-wave verdict V3),
 *  so the host CANNOT yet derive this server-side. Shipping the shape now (across
 *  host + login-ui + user-ui session.service.ts, the shared `snap.session`
 *  localStorage contract) so the later atomic backend bump doesn't require a
 *  cross-tab-incompatible shape change. Defaults to 'active' when absent. */
export type AccessStatus = 'active' | 'suspended' | 'banned';

export interface SnapSession {
  id: string;                 // casdoor identity, e.g. google:alice@gmail.com
  label: string;              // display (email or discord handle)
  provider: 'google' | 'discord';
  roles: string[];
  bffToken: string;
  registrationComplete: boolean;
  matrix: { token: string; userId: string } | null;
  mastodon: { token: string } | null;
  /** ADDITIVE (no enforcement yet) — see {@link AccessStatus}. Absent => 'active'. */
  status?: AccessStatus;
}

/** Holds the logged-in session (persisted to localStorage under the canonical
 *  "snap.session" key the login remote writes) and derives the Casdoor-style role
 *  flags + the registration-complete gate the host uses to unlock the
 *  Matrix/Mastodon micro-frontends, plus the admin/mod role routing of Phase 10.
 *
 *  This is the SAME contract used VERBATIM by login-ui, admin-ui and the matrix
 *  reference host. In-session role STRINGS are lowercase ('admin','mod','user');
 *  the ROLE_ADMIN/ROLE_MOD/ROLE_USER names are the Casdoor labels behind them. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly key = 'snap.session';
  private readonly channel = 'snap-session-change';
  readonly session = signal<SnapSession | null>(this.load());
  readonly loggedIn = computed(() => this.session() !== null);
  readonly isAdmin = computed(() => (this.session()?.roles ?? []).includes('admin'));
  /** Moderator role -> the /mod role-home (snapdragon-mod-ui remote). */
  readonly isMod = computed(() => (this.session()?.roles ?? []).includes('mod'));
  /** Superadmin role (cross-domain manage-all, sits ABOVE admin in the cascade
   *  SUPERADMIN > ADMIN > MOD > USER). Lowercase 'superadmin' role string, mirroring
   *  isAdmin/isMod. Used by service guards that grant superadmins unconditional
   *  access (e.g. the wiki management remote: superadmin manages ALL wiki features). */
  readonly isSuperadmin = computed(() => (this.session()?.roles ?? []).includes('superadmin'));
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
    // instance over the same localStorage key. Re-read on a same-document broadcast
    // (dispatched by whichever instance wrote) and on cross-tab storage events, so
    // every nav/guard reading this signal stays in sync — e.g. the login remote
    // completing registration must unlock the host shell's Matrix/Mastodon nav.
    if (typeof window !== 'undefined') {
      window.addEventListener(this.channel, () => this.session.set(this.load()));
      window.addEventListener('storage', (e) => { if (e.key === this.key) this.session.set(this.load()); });
    }
  }

  private load(): SnapSession | null {
    try { const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  set(s: SnapSession): void { localStorage.setItem(this.key, JSON.stringify(s)); this.session.set(s); this.broadcast(); }
  patch(p: Partial<SnapSession>): void { const s = this.session(); if (s) this.set({ ...s, ...p }); }
  clear(): void { localStorage.removeItem(this.key); this.session.set(null); this.broadcast(); }
  /** Notify the other in-page SessionService instances (host + remotes) to re-read. */
  private broadcast(): void { if (typeof window !== 'undefined') window.dispatchEvent(new Event(this.channel)); }
}
