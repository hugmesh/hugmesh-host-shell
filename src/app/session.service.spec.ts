import { TestBed } from '@angular/core/testing';
import { SESSION_ENDPOINT, SessionService, SnapSession } from './session.service';

function makeSession(overrides: Partial<SnapSession> = {}): SnapSession {
  return {
    id: 'google:alice@gmail.com',
    label: 'alice@gmail.com',
    provider: 'google',
    roles: ['user'],
    registrationComplete: false,
    ...overrides,
  };
}

/** Minimal Response stub for the mocked fetch — mirrors the federation-bootstrap
 *  spec's `okJson`/`status` helpers. */
function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function status(code: number): Response {
  return { ok: false, status: code, json: async () => ({}) } as unknown as Response;
}
/** Real macrotask flush so an async hydrate() fired-and-forgotten by the
 *  constructor or a broadcast listener settles before we assert. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('SessionService', () => {
  let service: SessionService;
  let fetchSpy: jasmine.Spy;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    localStorage.clear();
    // Default: no live BFF in the unit env (the e2e/mock-stack shape). The
    // constructor's bootstrap hydrate() therefore rejects and falls back to the
    // localStorage mirror; individual tests re-point the spy for the 200/401 paths.
    fetchSpy = jasmine.createSpy('fetch').and.rejectWith(new Error('no bff in unit env'));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionService);
    await flush(); // let the constructor's bootstrap probe settle deterministically
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it('reads the canonical hug.session localStorage key', () => {
    expect(service.loggedIn()).toBeFalse();
    service.set(makeSession());
    expect(localStorage.getItem('hug.session')).withContext('writes the canonical key').not.toBeNull();
    expect(service.loggedIn()).toBeTrue();
  });

  it('derives isAdmin from the lowercase admin role string', () => {
    service.set(makeSession({ roles: ['user'] }));
    expect(service.isAdmin()).toBeFalse();
    service.set(makeSession({ roles: ['user', 'admin'] }));
    expect(service.isAdmin()).toBeTrue();
  });

  it('derives isMod from the lowercase mod role string', () => {
    service.set(makeSession({ roles: ['user', 'mod'] }));
    expect(service.isMod()).toBeTrue();
    expect(service.isAdmin()).toBeFalse();
  });

  it('derives isSuperadmin from the lowercase superadmin role string', () => {
    service.set(makeSession({ roles: ['user', 'admin'] }));
    expect(service.isSuperadmin()).withContext('admin is not superadmin').toBeFalse();
    service.set(makeSession({ roles: ['user', 'superadmin'] }));
    expect(service.isSuperadmin()).toBeTrue();
  });

  it('derives isGames from the lowercase games role string', () => {
    service.set(makeSession({ roles: ['user'] }));
    expect(service.isGames()).toBeFalse();
    service.set(makeSession({ roles: ['user', 'games'] }));
    expect(service.isGames()).toBeTrue();
  });

  describe('isGamesAdmin() — DERIVED ROLE_GAMES ∩ (ROLE_ADMIN ∪ ROLE_MOD)', () => {
    it('is false for a bare games member (e2e-gamesonly: ROLE_GAMES alone)', () => {
      service.set(makeSession({ roles: ['user', 'games'] }));
      expect(service.isGamesAdmin()).toBeFalse();
    });

    it('is false for a bare admin WITHOUT games (e2e-adminonly)', () => {
      service.set(makeSession({ roles: ['user', 'admin'] }));
      expect(service.isGamesAdmin()).toBeFalse();
    });

    it('is true for games + admin (e2e-gamesadmin earns the derived role)', () => {
      service.set(makeSession({ roles: ['user', 'games', 'admin'] }));
      expect(service.isGamesAdmin()).toBeTrue();
    });

    it('is true for games + mod (the ROLE_ADMIN ∪ ROLE_MOD half of the intersection)', () => {
      service.set(makeSession({ roles: ['user', 'games', 'mod'] }));
      expect(service.isGamesAdmin()).toBeTrue();
    });

    it('is false for a plain user with neither games nor admin/mod', () => {
      service.set(makeSession({ roles: ['user'] }));
      expect(service.isGamesAdmin()).toBeFalse();
    });
  });

  describe('hasRole(role) — per-service access sub-role (e.g. ROLE_WIKI)', () => {
    it('is false when the session lacks the role', () => {
      service.set(makeSession({ roles: ['user', 'mod'] }));
      expect(service.hasRole('wiki')).toBeFalse();
    });

    it('is true when the session carries the lowercase role string', () => {
      service.set(makeSession({ roles: ['user', 'mod', 'wiki'] }));
      expect(service.hasRole('wiki')).toBeTrue();
    });

    it('matches case-insensitively (Casdoor ROLE_WIKI vs lowercase wiki)', () => {
      service.set(makeSession({ roles: ['user', 'WIKI'] }));
      expect(service.hasRole('wiki')).toBeTrue();
      expect(service.hasRole('WIKI')).toBeTrue();
    });

    it('is false for an anonymous session', () => {
      expect(service.hasRole('wiki')).toBeFalse();
    });
  });

  it('treats every logged-in identity as at least a ROLE_USER', () => {
    expect(service.isUser()).withContext('anonymous is not a user').toBeFalse();
    service.set(makeSession({ roles: [] }));
    expect(service.isUser()).withContext('any logged-in session is a user').toBeTrue();
  });

  describe('role() — effective role-home (admin > mod > user)', () => {
    it('is null when no one is signed in', () => {
      expect(service.role()).toBeNull();
    });

    it('is "user" for a plain authenticated identity', () => {
      service.set(makeSession({ roles: ['user'] }));
      expect(service.role()).toBe('user');
    });

    it('is "mod" for a moderator without the admin role', () => {
      service.set(makeSession({ roles: ['user', 'mod'] }));
      expect(service.role()).toBe('mod');
    });

    it('is "admin" and OUTRANKS mod/user when the admin role is present', () => {
      service.set(makeSession({ roles: ['user', 'mod', 'admin'] }));
      expect(service.role()).toBe('admin');
    });
  });

  describe('status() / curtailed() — the roleHomeGuard appeal short-circuit input', () => {
    it('is active (not curtailed) when anonymous', () => {
      expect(service.status()).toBe('active');
      expect(service.curtailed()).toBeFalse();
    });

    it('fails open to active when the session carries NO status field (older writer)', () => {
      service.set(makeSession());
      expect(service.status()).toBe('active');
      expect(service.curtailed()).toBeFalse();
    });

    it('surfaces a suspended session as curtailed', () => {
      service.set(makeSession({ status: 'suspended' }));
      expect(service.status()).toBe('suspended');
      expect(service.curtailed()).toBeTrue();
    });

    it('surfaces a banned session as curtailed', () => {
      service.set(makeSession({ status: 'banned' }));
      expect(service.status()).toBe('banned');
      expect(service.curtailed()).toBeTrue();
    });

    it('an explicit active status is not curtailed', () => {
      service.set(makeSession({ status: 'active' }));
      expect(service.curtailed()).toBeFalse();
    });
  });

  it('gates fullyRegistered on registrationComplete === true', () => {
    service.set(makeSession({ registrationComplete: false }));
    expect(service.fullyRegistered()).toBeFalse();
    service.set(makeSession({ registrationComplete: true }));
    expect(service.fullyRegistered()).toBeTrue();
  });

  it('clear() removes the key and drops loggedIn', async () => {
    service.set(makeSession());
    await service.clear();
    expect(localStorage.getItem('hug.session')).toBeNull();
    expect(service.loggedIn()).toBeFalse();
  });

  it('re-HYDRATES from /bff/session on the snap-session-change broadcast (authoritative re-read)', async () => {
    expect(service.isAdmin()).toBeFalse();
    // A remote (or AccountStatusService) wrote the mirror + broadcast; the host
    // does an authoritative re-read of /bff/session rather than trusting the mirror.
    fetchSpy.and.resolveTo(okJson({ id: 'google:alice@gmail.com', roles: ['admin'], registrationComplete: true }));
    window.dispatchEvent(new Event('snap-session-change'));
    await flush();
    expect(fetchSpy).toHaveBeenCalledWith(SESSION_ENDPOINT, jasmine.objectContaining({ credentials: 'include' }));
    expect(service.isAdmin()).withContext('host re-hydrates authoritatively on broadcast').toBeTrue();
  });

  describe('hydrate() — GET /bff/session, the mid-session freshness probe', () => {
    it('a 200 updates the in-memory roles but NEVER writes the localStorage mirror', async () => {
      // A stale mirror (plain user) that the server has since promoted to admin.
      localStorage.setItem('hug.session', JSON.stringify(makeSession({ roles: ['user'] })));
      fetchSpy.and.resolveTo(
        okJson({ id: 'google:alice@gmail.com', roles: ['user', 'admin'], registrationComplete: true }),
      );

      const result = await service.hydrate();

      expect(fetchSpy).toHaveBeenCalledWith(SESSION_ENDPOINT, jasmine.objectContaining({ credentials: 'include' }));
      expect(service.isAdmin()).withContext('in-memory reflects the fresh role').toBeTrue();
      expect(result?.roles).toContain('admin');
      // login-ui owns the mirror: the host updates the signal ONLY, so the stale
      // localStorage roles are deliberately left untouched (no host write).
      const mirror = JSON.parse(localStorage.getItem('hug.session') ?? 'null');
      expect(mirror.roles).withContext('mirror is NOT rewritten by hydrate').toEqual(['user']);
    });

    it('a fetch REJECTION retains the seeded localStorage session (never clobbers to anonymous)', async () => {
      localStorage.setItem('hug.session', JSON.stringify(makeSession({ roles: ['user'] })));
      fetchSpy.and.rejectWith(new Error('offline'));

      const result = await service.hydrate();

      expect(result).toBeNull();
      expect(service.loggedIn()).withContext('seeded session survives a failed probe').toBeTrue();
      expect(service.hasRole('user')).toBeTrue();
      expect(localStorage.getItem('hug.session')).not.toBeNull();
    });

    it('a 401 (expired cookie) also retains the seeded session — the stale mirror stands', async () => {
      localStorage.setItem('hug.session', JSON.stringify(makeSession({ roles: ['user', 'mod'] })));
      fetchSpy.and.resolveTo(status(401));

      const result = await service.hydrate();

      expect(result).toBeNull();
      expect(service.isMod()).withContext('a 401 does not drop the known session').toBeTrue();
    });

    it('preserves the /bff/me-owned status field across a 200 (only /bff/session-carried fields change)', async () => {
      service.set(makeSession({ roles: ['user'], status: 'suspended' }));
      await flush(); // settle the broadcast-triggered hydrate set() fires before re-pointing the spy
      fetchSpy.and.resolveTo(okJson({ id: 'google:alice@gmail.com', roles: ['user', 'admin'], registrationComplete: true }));

      await service.hydrate();

      expect(service.isAdmin()).toBeTrue();
      expect(service.status()).withContext('status stays owned by AccountStatusService/bff/me').toBe('suspended');
    });
  });

  it('re-reads the signal on a cross-tab storage event for hug.session', () => {
    expect(service.fullyRegistered()).toBeFalse();
    localStorage.setItem('hug.session', JSON.stringify(makeSession({ registrationComplete: true })));
    window.dispatchEvent(new StorageEvent('storage', { key: 'hug.session' }));
    expect(service.fullyRegistered()).toBeTrue();
  });

  it('ignores storage events for unrelated keys', () => {
    service.set(makeSession({ registrationComplete: true }));
    localStorage.setItem('other.key', 'x');
    window.dispatchEvent(new StorageEvent('storage', { key: 'other.key' }));
    expect(service.fullyRegistered()).toBeTrue();
  });

  describe('clear() — REAL sign-out, not just local state', () => {
    it('POSTs /bff/sessionOut so the server session is expired', async () => {
      service.set(makeSession({}));
      fetchSpy.calls.reset();
      fetchSpy.and.resolveTo(okJson({ loggedOut: true }));

      await service.clear();

      const call = fetchSpy.calls.allArgs().find(([url]) => String(url).endsWith('/bff/sessionOut'));
      expect(call).withContext('sign-out must expire the SERVER session, not only localStorage').toBeDefined();
      expect(call![1].method).toBe('POST');
      expect(call![1].credentials)
        .withContext('the HttpOnly bff_session cookie must ride along or nothing is revoked')
        .toBe('include');
    });

    it('REGRESSION: the broadcast-triggered re-read cannot resurrect the session', async () => {
      // THE BUG. clear() used to drop local state only. Its own broadcast() re-enters
      // hydrate(), which re-reads /bff/session WITH the surviving cookie, gets a 200 and
      // puts the session straight back — so "Sign out" left you navigable, kept your id in
      // the menubar and never showed the login screen.
      //
      // The server is modelled STATEFULLY, because that is the actual mechanism: while the
      // session lives /bff/session answers 200, and POSTing /bff/sessionOut is what flips it
      // to 401. So this test fails if clear() never calls sessionOut (the original bug: the
      // cookie stays alive, the re-read 200s, the session returns) AND it fails if clear()
      // calls it without awaiting (the re-read can win the race and 200 first). Only
      // expiring the session BEFORE broadcasting passes.
      let serverSessionAlive = true;
      fetchSpy.and.callFake((url: string) => {
        if (String(url).endsWith('/bff/sessionOut')) {
          serverSessionAlive = false;
          return Promise.resolve(okJson({ loggedOut: true }));
        }
        return Promise.resolve(serverSessionAlive
          ? okJson({ id: 'google:alice@gmail.com', roles: ['user'], registrationComplete: true })
          : status(401));
      });

      service.set(makeSession({}));
      expect(service.loggedIn()).toBeTrue();

      await service.clear();
      await flush(); // let the broadcast-triggered hydrate resolve

      expect(service.loggedIn())
        .withContext('signed out must STAY signed out after the authoritative re-read')
        .toBeFalse();
      expect(service.session()).toBeNull();
    });

    it('still signs out locally when the server call fails (offline / already-dead cookie)', async () => {
      service.set(makeSession({}));
      fetchSpy.and.rejectWith(new Error('offline'));

      await service.clear();

      expect(service.loggedIn()).withContext('a network failure must not strand the user signed in').toBeFalse();
      expect(localStorage.getItem('hug.session')).toBeNull();
    });
  });
});
