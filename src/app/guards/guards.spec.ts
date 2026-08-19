import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';

import { adminGuard } from './admin.guard';
import { registeredGuard } from './registration.guard';
import { modGuard } from './mod.guard';
import { userGuard } from './user.guard';
import { wikiGuard } from './wiki.guard';
import { tubeGuard } from './tube.guard';
import { owncastGuard } from './owncast.guard';
import { gamesGuard } from './games.guard';
import { gamesAdminGuard } from './games-admin.guard';
import { roleHomeGuard } from './role-home.guard';
import { AccessStatus, SessionService, ShellRole } from '../session.service';

/** Minimal SessionService double exposing the role/registration signals the
 *  guards read. We drive the boolean flags per-case and assert allow vs the
 *  exact /login redirect (a UrlTree), i.e. real guard behaviour — not creation. */
class SessionStub {
  admin = false;
  mod = false;
  user = false;
  superadmin = false;
  games = false;
  gamesAdmin = false;
  roles: string[] = [];
  registered = false;
  effectiveRole: ShellRole | null = null;
  /** The session's access status (roleHomeGuard's appeal short-circuit input);
   *  'active' default mirrors the real computed's absent-field fail-open. */
  accessStatus: AccessStatus = 'active';
  /** The raw session object. The factory distinguishes NOT-SIGNED-IN (null) from
   *  SIGNED-IN-BUT-UNAUTHORIZED, so the stub must model both. Default: signed in,
   *  which is the case nearly every test below is really about. */
  sessionValue: unknown = { id: 'casdoor:stub' };
  session = () => this.sessionValue;
  isAdmin = () => this.admin;
  isMod = () => this.mod;
  isUser = () => this.user;
  isSuperadmin = () => this.superadmin;
  isGames = () => this.games;
  isGamesAdmin = () => this.gamesAdmin;
  hasRole = (role: string) => this.roles.some((r) => r.toLowerCase() === role.toLowerCase());
  fullyRegistered = () => this.registered;
  role = () => this.effectiveRole;
  status = () => this.accessStatus;
  curtailed = () => this.accessStatus === 'suspended' || this.accessStatus === 'banned';
}

/** The path a denied test pretends to be navigating to. */
const ATTEMPTED = '/attempted';

function run(guard: typeof adminGuard, url: string = ATTEMPTED): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    guard({} as never, { url } as never)) as boolean | UrlTree;
}

describe('federation route guards', () => {
  let session: SessionStub;
  let router: Router;

  beforeEach(() => {
    session = new SessionStub();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: session },
      ],
    });
    router = TestBed.inject(Router);
  });

  /** What a SIGNED-IN but unauthorized user must now get: kept inside the app, with
   *  the refused path carried, instead of being told to log in again (they are
   *  logged in — that is what made the operator's 2026-08-14 report read as a broken
   *  mesh rather than a permissions boundary). */
  function denied(url: string = ATTEMPTED): UrlTree {
    return router.createUrlTree(['/home'], { queryParams: { denied: url } });
  }

  /** THE DEFECT the operator hit on 2026-08-14 ("moderation menu option just
   *  redirects to login"). The two failures are different and must not share a
   *  destination: being signed out is fixable by signing in, lacking a role is not.
   *  Collapsing them told a signed-in user to sign in, which read as a broken mesh
   *  and actively misdirected the diagnosis toward sessions when the real fault was
   *  stripped Casdoor role membership. */
  describe('authenticated-but-unauthorized vs not-authenticated', () => {
    it('keeps a SIGNED-IN user in the app and names the refused path', () => {
      session.sessionValue = { id: 'casdoor:someone' };
      session.mod = false;
      const result = run(modGuard, '/mod');
      expect(result).toEqual(denied('/mod'));
      expect((result as UrlTree).queryParams['denied']).toBe('/mod');
    });

    it('does NOT send a signed-in user to /login', () => {
      session.sessionValue = { id: 'casdoor:someone' };
      session.mod = false;
      expect(run(modGuard, '/mod')).not.toEqual(router.parseUrl('/login'));
    });

    it('still sends a SIGNED-OUT visitor to /login', () => {
      session.sessionValue = null;
      session.mod = false;
      expect(run(modGuard, '/mod')).toEqual(router.parseUrl('/login'));
    });
  });

  describe('adminGuard', () => {
    it('allows when the session has the admin role', () => {
      session.admin = true;
      expect(run(adminGuard)).toBeTrue();
    });

    it('redirects non-admins to the denied landing', () => {
      session.admin = false;
      const result = run(adminGuard);
      expect(result).toEqual(denied());
    });
  });

  describe('registeredGuard', () => {
    it('allows a fully-registered user into the social remotes', () => {
      session.registered = true;
      expect(run(registeredGuard)).toBeTrue();
    });

    it('redirects an unregistered user to the denied landing', () => {
      session.registered = false;
      expect(run(registeredGuard)).toEqual(denied());
    });
  });

  describe('modGuard', () => {
    it('allows a moderator into the /mod placeholder', () => {
      session.mod = true;
      expect(run(modGuard)).toBeTrue();
    });

    it('redirects a non-moderator to the denied landing', () => {
      session.mod = false;
      expect(run(modGuard)).toEqual(denied());
    });

    it('does NOT admit an admin who lacks the mod role', () => {
      session.admin = true;
      session.mod = false;
      expect(run(modGuard)).toEqual(denied());
    });
  });

  describe('userGuard', () => {
    it('allows any authenticated identity into the user role-home', () => {
      session.user = true;
      expect(run(userGuard)).toBeTrue();
    });

    it('redirects an anonymous visitor to /login', () => {
      session.sessionValue = null;
      session.user = false;
      expect(run(userGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('wikiGuard (admin | superadmin | mod+ROLE_WIKI)', () => {
    it('ALLOWS an admin', () => {
      session.admin = true;
      expect(run(wikiGuard)).toBeTrue();
    });

    it('ALLOWS a superadmin', () => {
      session.superadmin = true;
      expect(run(wikiGuard)).toBeTrue();
    });

    it('ALLOWS a moderator granted ROLE_WIKI', () => {
      session.mod = true;
      session.roles = ['mod', 'wiki'];
      expect(run(wikiGuard)).toBeTrue();
    });

    it('DENIES a bare moderator WITHOUT ROLE_WIKI (redirect to the denied landing)', () => {
      session.mod = true;
      session.roles = ['mod'];
      expect(run(wikiGuard)).toEqual(denied());
    });

    it('DENIES a plain user (redirect to the denied landing)', () => {
      session.user = true;
      expect(run(wikiGuard)).toEqual(denied());
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
      session.sessionValue = null;
      expect(run(wikiGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('tubeGuard (tube management remote at /tube)', () => {
    it('ALLOWS an administrator', () => {
      session.admin = true;
      expect(run(tubeGuard)).toBeTrue();
    });

    it('ALLOWS a superadmin', () => {
      session.superadmin = true;
      expect(run(tubeGuard)).toBeTrue();
    });

    it('ALLOWS a user granted ROLE_TUBE', () => {
      session.user = true;
      session.roles = ['user', 'tube'];
      expect(run(tubeGuard)).toBeTrue();
    });

    it('DENIES a plain user WITHOUT ROLE_TUBE (redirect to the denied landing)', () => {
      session.user = true;
      session.roles = ['user'];
      expect(run(tubeGuard)).toEqual(denied());
    });

    it('DENIES a bare moderator WITHOUT ROLE_TUBE (redirect to the denied landing)', () => {
      session.mod = true;
      session.roles = ['mod'];
      expect(run(tubeGuard)).toEqual(denied());
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
      session.sessionValue = null;
      expect(run(tubeGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('owncastGuard (owncast management remote at /owncast)', () => {
    it('ALLOWS an administrator', () => {
      session.admin = true;
      expect(run(owncastGuard)).toBeTrue();
    });

    it('ALLOWS a superadmin', () => {
      session.superadmin = true;
      expect(run(owncastGuard)).toBeTrue();
    });

    it('ALLOWS a user granted ROLE_OWNCAST', () => {
      session.user = true;
      session.roles = ['user', 'owncast'];
      expect(run(owncastGuard)).toBeTrue();
    });

    it('ALLOWS a moderator granted ROLE_OWNCAST', () => {
      session.mod = true;
      session.roles = ['mod', 'owncast'];
      expect(run(owncastGuard)).toBeTrue();
    });

    it('DENIES a plain user WITHOUT ROLE_OWNCAST (redirect to the denied landing)', () => {
      session.user = true;
      session.roles = ['user'];
      expect(run(owncastGuard)).toEqual(denied());
    });

    it('DENIES a bare moderator WITHOUT ROLE_OWNCAST (redirect to the denied landing)', () => {
      session.mod = true;
      session.roles = ['mod'];
      expect(run(owncastGuard)).toEqual(denied());
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
      session.sessionValue = null;
      expect(run(owncastGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('gamesGuard (games entry-point remote at /games)', () => {
    it('ALLOWS a games member (e2e-gamesonly)', () => {
      session.games = true;
      expect(run(gamesGuard)).toBeTrue();
    });

    it('ALLOWS an administrator (even without ROLE_GAMES)', () => {
      session.admin = true;
      expect(run(gamesGuard)).toBeTrue();
    });

    it('ALLOWS a superadmin', () => {
      session.superadmin = true;
      expect(run(gamesGuard)).toBeTrue();
    });

    it('DENIES a plain user WITHOUT ROLE_GAMES (redirect to /login)', () => {
      session.user = true;
      expect(run(gamesGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES a bare moderator WITHOUT ROLE_GAMES (redirect to /login)', () => {
      session.mod = true;
      expect(run(gamesGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
      expect(run(gamesGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('gamesAdminGuard (DERIVED ROLE_GAMES_ADMIN mount at /games/admin)', () => {
    it('ALLOWS the derived games-admin (e2e-gamesadmin: games + admin)', () => {
      session.gamesAdmin = true;
      expect(run(gamesAdminGuard)).toBeTrue();
    });

    it('ALLOWS a superadmin', () => {
      session.superadmin = true;
      expect(run(gamesAdminGuard)).toBeTrue();
    });

    it('DENIES a bare games member (e2e-gamesonly: ROLE_GAMES alone)', () => {
      session.games = true;
      expect(run(gamesAdminGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES a bare admin WITHOUT games (e2e-adminonly)', () => {
      session.admin = true;
      expect(run(gamesAdminGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
      expect(run(gamesAdminGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('roleHomeGuard (authgate + member-home redirect)', () => {
    it('redirects an anonymous visitor to /login', () => {
      session.effectiveRole = null;
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/login'));
    });

    // ADMIN/MOD ARE NOT THE HOME PAGE (issue #19): the consoles are reachable
    // from the menubar, but the default route lands EVERY signed-in identity on
    // the member home. userGuard admits any authenticated identity, so the
    // shared destination can never bounce a role-holder.
    it('redirects an admin to /user — the admin console is NOT the home page', () => {
      session.effectiveRole = 'admin';
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/user'));
    });

    it('redirects a moderator to /user — the mod console is NOT the home page', () => {
      session.effectiveRole = 'mod';
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/user'));
    });

    it('redirects a plain user to /user', () => {
      session.effectiveRole = 'user';
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/user'));
    });

    it('an ACTIVE status keeps the plain role redirect (no appeal detour)', () => {
      session.effectiveRole = 'user';
      session.accessStatus = 'active';
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/user'));
    });

    describe('suspended/banned appeal short-circuit (BEFORE the role redirect)', () => {
      it('redirects a SUSPENDED user to /login/appeal, not the role-home', () => {
        session.effectiveRole = 'user';
        session.accessStatus = 'suspended';
        expect(run(roleHomeGuard)).toEqual(router.parseUrl('/login/appeal'));
      });

      it('redirects a BANNED user to /login/appeal, not the role-home', () => {
        session.effectiveRole = 'user';
        session.accessStatus = 'banned';
        expect(run(roleHomeGuard)).toEqual(router.parseUrl('/login/appeal'));
      });

      it('short-circuits BEFORE the role redirect — a suspended ADMIN goes to appeal, not /admin', () => {
        session.effectiveRole = 'admin';
        session.accessStatus = 'suspended';
        expect(run(roleHomeGuard)).toEqual(router.parseUrl('/login/appeal'));
      });

      it('short-circuits a banned MOD to appeal, not /mod', () => {
        session.effectiveRole = 'mod';
        session.accessStatus = 'banned';
        expect(run(roleHomeGuard)).toEqual(router.parseUrl('/login/appeal'));
      });

      it('the AUTHGATE still wins: an anonymous visitor goes to /login even with a stale curtailed flag', () => {
        session.effectiveRole = null;
        session.accessStatus = 'banned';
        expect(run(roleHomeGuard)).toEqual(router.parseUrl('/login'));
      });
    });
  });
});
