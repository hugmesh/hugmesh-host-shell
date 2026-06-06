import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';

import { adminGuard } from './admin.guard';
import { registeredGuard } from './registration.guard';
import { modGuard } from './mod.guard';
import { SessionService } from '../session.service';

/** Minimal SessionService double exposing the role/registration signals the
 *  guards read. We drive the boolean flags per-case and assert allow vs the
 *  exact /login redirect (a UrlTree), i.e. real guard behaviour — not creation. */
class SessionStub {
  admin = false;
  mod = false;
  registered = false;
  isAdmin = () => this.admin;
  isMod = () => this.mod;
  fullyRegistered = () => this.registered;
}

function run(guard: typeof adminGuard): boolean | UrlTree {
  return TestBed.runInInjectionContext(() => guard({} as never, {} as never)) as
    | boolean
    | UrlTree;
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

  describe('adminGuard', () => {
    it('allows when the session has the admin role', () => {
      session.admin = true;
      expect(run(adminGuard)).toBeTrue();
    });

    it('redirects non-admins to /login', () => {
      session.admin = false;
      const result = run(adminGuard);
      expect(result).toEqual(router.parseUrl('/login'));
    });
  });

  describe('registeredGuard', () => {
    it('allows a fully-registered user into the social remotes', () => {
      session.registered = true;
      expect(run(registeredGuard)).toBeTrue();
    });

    it('redirects an unregistered user to /login', () => {
      session.registered = false;
      expect(run(registeredGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('modGuard', () => {
    it('allows a moderator into the /mod placeholder', () => {
      session.mod = true;
      expect(run(modGuard)).toBeTrue();
    });

    it('redirects a non-moderator to /login', () => {
      session.mod = false;
      expect(run(modGuard)).toEqual(router.parseUrl('/login'));
    });

    it('does NOT admit an admin who lacks the mod role', () => {
      session.admin = true;
      session.mod = false;
      expect(run(modGuard)).toEqual(router.parseUrl('/login'));
    });
  });
});
