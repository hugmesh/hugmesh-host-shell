import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';

import { adminGuard } from './admin.guard';
import { registeredGuard } from './registration.guard';
import { modGuard } from './mod.guard';
import { userGuard } from './user.guard';
import { roleHomeGuard } from './role-home.guard';
import { SessionService, ShellRole } from '../session.service';

/** Minimal SessionService double exposing the role/registration signals the
 *  guards read. We drive the boolean flags per-case and assert allow vs the
 *  exact /login redirect (a UrlTree), i.e. real guard behaviour — not creation. */
class SessionStub {
  admin = false;
  mod = false;
  user = false;
  registered = false;
  effectiveRole: ShellRole | null = null;
  isAdmin = () => this.admin;
  isMod = () => this.mod;
  isUser = () => this.user;
  fullyRegistered = () => this.registered;
  role = () => this.effectiveRole;
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

  describe('userGuard', () => {
    it('allows any authenticated identity into the user role-home', () => {
      session.user = true;
      expect(run(userGuard)).toBeTrue();
    });

    it('redirects an anonymous visitor to /login', () => {
      session.user = false;
      expect(run(userGuard)).toEqual(router.parseUrl('/login'));
    });
  });

  describe('roleHomeGuard (authgate + role-home redirect)', () => {
    it('redirects an anonymous visitor to /login', () => {
      session.effectiveRole = null;
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/login'));
    });

    it('redirects an admin to /admin', () => {
      session.effectiveRole = 'admin';
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/admin'));
    });

    it('redirects a moderator to /mod', () => {
      session.effectiveRole = 'mod';
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/mod'));
    });

    it('redirects a plain user to /user', () => {
      session.effectiveRole = 'user';
      expect(run(roleHomeGuard)).toEqual(router.parseUrl('/user'));
    });
  });
});
