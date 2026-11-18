import { TestBed } from '@angular/core/testing';
import { Router, UrlSegment, UrlTree, provideRouter } from '@angular/router';

import { userGuard } from './user.guard';
import { adminGuard } from './admin.guard';
import { HYDRATE_WAIT_MS } from './role-guard.factory';

import { SessionService } from '../session.service';

/** Issue #180: a session that lives only in the `bff_session` cookie (no `hug.session`
 *  mirror) must not bounce a signed-in deep link to /login. These specs use the REAL
 *  SessionService (so the real bootstrap hydrate is what the guard waits on) with only
 *  fetch stubbed. */
function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function status(code: number): Response {
  return { ok: false, status: code, json: async () => ({}) } as unknown as Response;
}

const COOKIE_SESSION = {
  id: 'casdoor:cookie-only',
  label: 'cookie-only',
  provider: 'casdoor',
  roles: ['user'],
  registrationComplete: true,
};

describe('roleGuard with a cookie-only session (no localStorage mirror)', () => {
  const originalFetch = globalThis.fetch;
  let router: Router;

  function setup(fetchImpl: () => Promise<Response>): void {
    localStorage.clear();
    globalThis.fetch = jasmine.createSpy('fetch').and.callFake(fetchImpl) as unknown as typeof fetch;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  }

  function run(guard: typeof userGuard, url = '/user'): unknown {
    return TestBed.runInInjectionContext(() => guard({} as never, { url } as never));
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it('lets a signed-in deep link through once the first hydrate confirms the cookie', async () => {
    setup(async () => okJson(COOKIE_SESSION));
    TestBed.inject(SessionService); // constructs the service: the bootstrap hydrate starts
    const out = run(userGuard);
    expect(out).withContext('it waits instead of deciding on the empty signal').toEqual(jasmine.any(Promise));
    expect(await out).toBeTrue();
  });

  it('works for the canMatch call shape too', async () => {
    setup(async () => okJson(COOKIE_SESSION));
    TestBed.inject(SessionService);
    const out = TestBed.runInInjectionContext(() =>
      userGuard({} as never, [new UrlSegment('user', {})] as never));
    expect(await out).toBeTrue();
  });

  it('still sends a really signed-out visitor to /login (401 from the BFF)', async () => {
    setup(async () => status(401));
    TestBed.inject(SessionService);
    const out = (await run(userGuard)) as UrlTree;
    expect(router.serializeUrl(out)).toBe('/login');
  });

  it('still sends a signed-out visitor to /login when the BFF is unreachable', async () => {
    setup(() => Promise.reject(new Error('offline')));
    TestBed.inject(SessionService);
    const out = (await run(userGuard)) as UrlTree;
    expect(router.serializeUrl(out)).toBe('/login');
  });

  it('keeps the denied landing for a confirmed user who lacks the role', async () => {
    setup(async () => okJson(COOKIE_SESSION));
    TestBed.inject(SessionService);
    const out = (await run(adminGuard, '/admin')) as UrlTree;
    expect(router.serializeUrl(out)).toBe('/home?denied=%2Fadmin');
  });

  it('does not wait when a mirror exists (the common path stays synchronous)', () => {
    localStorage.clear();
    localStorage.setItem('hug.session', JSON.stringify(COOKIE_SESSION));
    globalThis.fetch = jasmine.createSpy('fetch').and.returnValue(new Promise(() => {})) as unknown as typeof fetch;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(SessionService);
    expect(run(userGuard)).toBeTrue();
  });

  it('does not wait forever when the BFF hangs: it decides after HYDRATE_WAIT_MS', async () => {
    jasmine.clock().install();
    try {
      setup(() => new Promise<Response>(() => {})); // never answers
      TestBed.inject(SessionService);
      const out = run(userGuard) as Promise<unknown>;
      jasmine.clock().tick(HYDRATE_WAIT_MS + 1);
      const settled = (await out) as UrlTree;
      expect(router.serializeUrl(settled)).toBe('/login');
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
