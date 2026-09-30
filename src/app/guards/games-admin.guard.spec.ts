import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';

import { gamesAdminGuard } from './games-admin.guard';
import { SessionService } from '../session.service';

/** Minimal SessionService double exposing the role signals gamesAdminGuard
 *  reads. isGamesAdmin is driven directly: the real computed is the DERIVED
 *  ROLE_GAMES ∩ (ROLE_ADMIN ∪ ROLE_MOD) and is covered in session.service.spec;
 *  here each case sets the flags a real session of that shape would expose. The
 *  raw session object is modelled because roleGuard distinguishes NOT-SIGNED-IN
 *  (session() === null) from SIGNED-IN-BUT-UNAUTHORIZED. Default: signed in,
 *  holding no role at all. */
class SessionStub {
  admin = false;
  mod = false;
  user = false;
  superadmin = false;
  games = false;
  gamesAdmin = false;
  sessionValue: unknown = { id: 'casdoor:stub' };
  session = () => this.sessionValue;
  isAdmin = () => this.admin;
  isMod = () => this.mod;
  isUser = () => this.user;
  isSuperadmin = () => this.superadmin;
  isGames = () => this.games;
  isGamesAdmin = () => this.gamesAdmin;
  hasRole = (_role: string) => false;
}

/** The mount this guard protects; roleGuard carries it along as ?denied=. */
const GAMES_ADMIN_PATH = '/games/admin';

function run(url: string = GAMES_ADMIN_PATH): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    gamesAdminGuard({} as never, { url } as never)) as boolean | UrlTree;
}

/** Issue #88: games-admin.guard.ts was the other guard still answering an
 *  AUTHORIZATION failure with the ANONYMOUS destination. An admin without games,
 *  or a games member without admin/mod, who opened /games/admin was told to sign
 *  in — while signed in — instead of landing on /home?denied=/games/admin where
 *  denied-notice explains the refusal like every other console mount. These
 *  specs pin the three outcomes roleGuard gives: admitted,
 *  signed-in-without-the-role, and signed-out. WHO is admitted is unchanged. */
describe('gamesAdminGuard (derived ROLE_GAMES_ADMIN mount at /games/admin)', () => {
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

  /** The landing a SIGNED-IN caller without the role must get. */
  function denied(url: string = GAMES_ADMIN_PATH): UrlTree {
    return router.createUrlTree(['/home'], { queryParams: { denied: url } });
  }

  describe('admitted (the admission rule is unchanged by #88)', () => {
    it('ALLOWS the derived games-admin (e2e-gamesadmin: games + admin)', () => {
      session.games = true;
      session.admin = true;
      session.gamesAdmin = true;
      expect(run()).toBeTrue();
    });

    it('ALLOWS a games moderator (games + mod) — the other half of the derivation', () => {
      session.games = true;
      session.mod = true;
      session.gamesAdmin = true;
      expect(run()).toBeTrue();
    });

    it('ALLOWS a superadmin unconditionally', () => {
      session.superadmin = true;
      expect(run()).toBeTrue();
    });
  });

  describe('signed in WITHOUT the derived role -> the denied landing, never /login', () => {
    it('sends a bare games member (e2e-gamesonly) to /home?denied=%2Fgames%2Fadmin', () => {
      session.games = true;
      const result = run();
      expect(result).toEqual(denied());
      expect(router.serializeUrl(result as UrlTree)).toBe('/home?denied=%2Fgames%2Fadmin');
    });

    it('sends a bare admin WITHOUT games (e2e-adminonly) to /home?denied=%2Fgames%2Fadmin', () => {
      session.admin = true;
      const result = run();
      expect(result).toEqual(denied());
      expect(router.serializeUrl(result as UrlTree)).toBe('/home?denied=%2Fgames%2Fadmin');
    });

    it('sends a bare moderator to the denied landing', () => {
      session.mod = true;
      expect(run()).toEqual(denied());
    });

    it('sends a plain user to the denied landing', () => {
      session.user = true;
      expect(run()).toEqual(denied());
    });

    it('does NOT send a signed-in user to /login — that is the anonymous answer', () => {
      session.admin = true;
      expect(run()).not.toEqual(router.parseUrl('/login'));
    });

    it('carries the ATTEMPTED path, not a fixed one, so the notice can name it', () => {
      session.games = true;
      const result = run('/games/admin/uploads');
      expect((result as UrlTree).queryParams['denied']).toBe('/games/admin/uploads');
    });
  });

  describe('signed OUT -> /login (there is a credential to supply)', () => {
    it('sends an anonymous visitor to /login', () => {
      session.sessionValue = null;
      expect(run()).toEqual(router.parseUrl('/login'));
    });

    it('does not carry a denied query for an anonymous visitor', () => {
      session.sessionValue = null;
      const result = run() as UrlTree;
      expect(result.queryParams['denied']).toBeUndefined();
    });
  });
});
