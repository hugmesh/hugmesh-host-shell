import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter, Route, Router, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes, REMOTE_ROUTES, federationLoader } from './app.routes';
import { DeniedNoticeComponent } from './home/denied-notice.component';
import { SessionService } from './session.service';

/**
 * Issue #93 / defect D2 (2026-10-29): a signed-in user WITHOUT the role who
 * navigates in-app to a guarded federated mount must land on the denied notice,
 * and the shell must not ask for the remote first.
 *
 * Live evidence before the fix (e2e-user on the local mesh, roles [user]): an
 * in-app navigation to /games left the URL on /home, showed no notice, and the
 * console only had `Could not fetch remoteEntry ... 403` NFErrors. The router
 * resolves `loadChildren` while recognising the route, BEFORE `canActivate`, so
 * the gateway's 403 on remoteEntry.json killed the navigation before the guard's
 * /home?denied=<path> redirect could run.
 *
 * These tests drive the REAL route table through a real Router. Only the `home`
 * page is swapped for a stub that renders the real DeniedNoticeComponent (the
 * real HomeComponent pulls in HTTP-backed services that are not under test), and
 * the federation loader is spied so no remote is fetched. The discriminating
 * assertion is on the loader: on main it IS called for a role-less session.
 */

@Component({
  selector: 'hug-test-home',
  imports: [DeniedNoticeComponent],
  template: `<p data-testid="stub-home">home</p><hug-denied-notice />`,
})
class StubHomeComponent {}

@Component({ selector: 'hug-test-remote', template: `<p data-testid="stub-remote">remote</p>` })
class StubRemoteComponent {}

/** What a remote's routes constant resolves to in these tests: any child path. */
const REMOTE_CHILDREN: Routes = [{ path: '**', component: StubRemoteComponent }];

/** A loaded remote module exporting EVERY routes constant the table names, so a
 *  load for any remote resolves (the /login mount included). */
function fakeRemoteModule(): Record<string, unknown> {
  return Object.fromEntries(REMOTE_ROUTES.map((r) => [r.routesConst, REMOTE_CHILDREN]));
}

/** The real route table with only `home` replaced (see header). */
function testRoutes(): Routes {
  return routes.map((r: Route) =>
    r.path === 'home' ? { path: 'home', component: StubHomeComponent } : r,
  );
}

/** SessionService double: every predicate false unless a test grants it. Signed
 *  in by default — the denied case is about a SIGNED-IN user without the role. */
class SessionStub {
  admin = false;
  mod = false;
  user = false;
  superadmin = false;
  games = false;
  gamesAdmin = false;
  registered = false;
  roles: string[] = [];
  sessionValue: unknown = { id: 'casdoor:e2e-user' };
  session = () => this.sessionValue;
  isAdmin = () => this.admin;
  isMod = () => this.mod;
  isUser = () => this.user;
  isSuperadmin = () => this.superadmin;
  isGames = () => this.games;
  isGamesAdmin = () => this.gamesAdmin;
  hasRole = (role: string) => this.roles.some((r) => r.toLowerCase() === role.toLowerCase());
  fullyRegistered = () => this.registered;
}

describe('role-gated remote mounts: denial happens BEFORE the remote is loaded (issue #93)', () => {
  let session: SessionStub;
  let router: Router;
  let harness: RouterTestingHarness;
  let load: jasmine.Spy;

  beforeEach(async () => {
    session = new SessionStub();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(testRoutes()),
        provideLocationMocks(),
        { provide: SessionService, useValue: session },
      ],
    });
    load = spyOn(federationLoader, 'load').and.callFake(async () => fakeRemoteModule());
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  /** Navigate in-app, tolerating a navigation that errors (what main does when
   *  the remote load rejects) so the assertions below report the real outcome. */
  async function navigate(url: string): Promise<void> {
    await harness.navigateByUrl(url).catch(() => undefined);
    harness.detectChanges();
  }

  function testid(id: string): HTMLElement | null {
    return harness.routeNativeElement?.querySelector(`[data-testid="${id}"]`) ?? null;
  }

  it('a role-less user going to /tube/budgets never loads the tube remote and lands on the denied notice', async () => {
    await navigate('/tube/budgets');

    expect(load).withContext('the gated remote must not be requested for a denied user').not.toHaveBeenCalled();
    expect(router.url).toBe('/home?denied=%2Ftube%2Fbudgets');
    expect(testid('denied-notice')).withContext('the denied notice renders').not.toBeNull();
    expect(testid('denied-notice')!.textContent).toContain('The video archive was not available.');
  });

  it('when the gateway refuses the remote (remoteEntry 403), the user still lands on the denied notice for /games', async () => {
    // Mirrors the live failure: the load rejects the way native-federation does
    // when the gateway answers 403 for remoteEntry.json.
    load.and.callFake(async () => {
      throw new Error('Could not fetch remoteEntry https://localhost:8488/games/remoteEntry.json: 403');
    });

    await navigate('/home');
    await navigate('/games');

    expect(load).not.toHaveBeenCalled();
    expect(router.url).toBe('/home?denied=%2Fgames');
    expect(testid('denied-notice')!.textContent).toContain('The games was not available.');
    expect(testid('denied-no-role')).withContext('the user genuinely lacks the role').not.toBeNull();
  });

  it('a games member (not games admin) going to /games/admin is denied there, not dropped into the member mount', async () => {
    session.games = true;

    await navigate('/games/admin');

    expect(load).not.toHaveBeenCalled();
    expect(router.url).toBe('/home?denied=%2Fgames%2Fadmin');
    expect(testid('denied-notice')!.textContent).toContain('The games administration was not available.');
  });

  it('keeps the query string in the denied path, as the canActivate side always did', async () => {
    await navigate('/owncast/moderation?tab=live');

    expect(load).not.toHaveBeenCalled();
    expect(router.url).toBe('/home?denied=%2Fowncast%2Fmoderation%3Ftab%3Dlive');
  });

  it('an anonymous visitor is sent to /login (not the denied notice) without loading the gated remote', async () => {
    session.sessionValue = null;

    await navigate('/games');

    expect(load).not.toHaveBeenCalledWith('games', jasmine.anything());
    expect(router.url).toBe('/login');
  });

  // Every guarded mount, not just the ones the live run happened to hit.
  REMOTE_ROUTES.filter((r) => r.canActivate?.length).forEach(({ path, remoteName }) => {
    it(`/${path}: a session holding no role is denied before remote '${remoteName}' is loaded`, async () => {
      await navigate(`/${path}/x`);

      expect(load).withContext(`remote '${remoteName}' must not be requested`).not.toHaveBeenCalled();
      expect(router.url).toBe(`/home?denied=${encodeURIComponent(`/${path}/x`)}`);
      expect(testid('denied-notice')).withContext('denied notice shown').not.toBeNull();
    });
  });

  describe('authorised navigation is unchanged', () => {
    it('a ROLE_TUBE holder loads the tube remote and stays on /tube/budgets', async () => {
      session.roles = ['TUBE'];

      await navigate('/tube/budgets');

      expect(load).toHaveBeenCalledOnceWith('tube', './Tube');
      expect(router.url).toBe('/tube/budgets');
      expect(testid('stub-remote')).withContext('the remote child rendered').not.toBeNull();
      expect(testid('denied-notice')).toBeNull();
    });

    it('a games admin loads ./admin-routes for /games/admin', async () => {
      session.games = true;
      session.gamesAdmin = true;

      await navigate('/games/admin');

      expect(load).toHaveBeenCalledOnceWith('games', './admin-routes');
      expect(router.url).toBe('/games/admin');
    });

    it('the unguarded /login mount still loads its remote for anyone', async () => {
      session.sessionValue = null;

      await navigate('/login');

      expect(load).toHaveBeenCalledOnceWith('login', './routes');
      expect(router.url).toBe('/login');
    });
  });

  it('every guarded mount carries the same guards on canMatch as on canActivate', () => {
    for (const spec of REMOTE_ROUTES) {
      const route = routes.find((r) => r.path === spec.path)!;
      if (spec.canActivate?.length) {
        expect(route.canMatch).withContext(`${spec.path} canMatch`).toEqual([...spec.canActivate]);
        expect(route.canActivate).withContext(`${spec.path} canActivate`).toEqual([...spec.canActivate]);
      } else {
        expect(route.canMatch).withContext(`${spec.path} has no guard`).toBeUndefined();
      }
    }
  });
});
