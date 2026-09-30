import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';

import { gamesGuard } from './games.guard';
import { SessionService } from '../session.service';

/** Minimal SessionService double exposing the role signals gamesGuard reads. The
 *  raw session object is modelled too: roleGuard distinguishes NOT-SIGNED-IN
 *  (session() === null) from SIGNED-IN-BUT-UNAUTHORIZED, and the two get
 *  different destinations. Default: signed in, holding no role at all. */
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
const GAMES_PATH = '/games';

function run(url: string = GAMES_PATH): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    gamesGuard({} as never, { url } as never)) as boolean | UrlTree;
}

/** Issue #88: games.guard.ts was one of the two guards left answering an
 *  AUTHORIZATION failure with the ANONYMOUS destination. A bare moderator who
 *  opened /games was told to sign in — while signed in — instead of landing on
 *  /home?denied=/games where denied-notice explains the refusal like every other
 *  console mount. These specs pin the three outcomes roleGuard gives: admitted,
 *  signed-in-without-the-role, and signed-out. WHO is admitted is unchanged. */
describe('gamesGuard (games entry-point at /games)', () => {
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
  function denied(url: string = GAMES_PATH): UrlTree {
    return router.createUrlTree(['/home'], { queryParams: { denied: url } });
  }

  describe('admitted (the admission rule is unchanged by #88)', () => {
    it('ALLOWS a games member (e2e-gamesonly)', () => {
      session.games = true;
      expect(run()).toBeTrue();
    });

    it('ALLOWS an administrator even without ROLE_GAMES (oversight)', () => {
      session.admin = true;
      expect(run()).toBeTrue();
    });

    it('ALLOWS a superadmin', () => {
      session.superadmin = true;
      expect(run()).toBeTrue();
    });

    it('ALLOWS the derived games-admin (games + mod) — it holds ROLE_GAMES', () => {
      session.games = true;
      session.mod = true;
      session.gamesAdmin = true;
      expect(run()).toBeTrue();
    });
  });

  describe('signed in WITHOUT the role -> the denied landing, never /login', () => {
    it('sends a bare moderator to /home?denied=%2Fgames', () => {
      session.mod = true;
      const result = run();
      expect(result).toEqual(denied());
      expect(router.serializeUrl(result as UrlTree)).toBe('/home?denied=%2Fgames');
    });

    it('sends a plain user to /home?denied=%2Fgames', () => {
      session.user = true;
      const result = run();
      expect(result).toEqual(denied());
      expect(router.serializeUrl(result as UrlTree)).toBe('/home?denied=%2Fgames');
    });

    it('sends a signed-in identity with no roles at all to the denied landing', () => {
      expect(run()).toEqual(denied());
    });

    it('does NOT send a signed-in user to /login — that is the anonymous answer', () => {
      session.mod = true;
      expect(run()).not.toEqual(router.parseUrl('/login'));
    });

    it('carries the ATTEMPTED path, not a fixed one, so the notice can name it', () => {
      session.mod = true;
      const result = run('/games?chapter=cave');
      expect((result as UrlTree).queryParams['denied']).toBe('/games?chapter=cave');
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
