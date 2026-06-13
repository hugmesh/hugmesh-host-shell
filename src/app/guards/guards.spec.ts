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
import { roleHomeGuard } from './role-home.guard';
import { SessionService, ShellRole } from '../session.service';

/** Minimal SessionService double exposing the role/registration signals the
 *  guards read. We drive the boolean flags per-case and assert allow vs the
 *  exact /login redirect (a UrlTree), i.e. real guard behaviour — not creation. */
class SessionStub {
  admin = false;
  mod = false;
  user = false;
  superadmin = false;
  roles: string[] = [];
  registered = false;
  effectiveRole: ShellRole | null = null;
  isAdmin = () => this.admin;
  isMod = () => this.mod;
  isUser = () => this.user;
  isSuperadmin = () => this.superadmin;
  hasRole = (role: string) => this.roles.some((r) => r.toLowerCase() === role.toLowerCase());
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

    it('DENIES a bare moderator WITHOUT ROLE_WIKI (redirect to /login)', () => {
      session.mod = true;
      session.roles = ['mod'];
      expect(run(wikiGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES a plain user (redirect to /login)', () => {
      session.user = true;
      expect(run(wikiGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
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

    it('DENIES a plain user WITHOUT ROLE_TUBE (redirect to /login)', () => {
      session.user = true;
      session.roles = ['user'];
      expect(run(tubeGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES a bare moderator WITHOUT ROLE_TUBE (redirect to /login)', () => {
      session.mod = true;
      session.roles = ['mod'];
      expect(run(tubeGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
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

    it('DENIES a plain user WITHOUT ROLE_OWNCAST (redirect to /login)', () => {
      session.user = true;
      session.roles = ['user'];
      expect(run(owncastGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES a bare moderator WITHOUT ROLE_OWNCAST (redirect to /login)', () => {
      session.mod = true;
      session.roles = ['mod'];
      expect(run(owncastGuard)).toEqual(router.parseUrl('/login'));
    });

    it('DENIES an anonymous visitor (redirect to /login)', () => {
      expect(run(owncastGuard)).toEqual(router.parseUrl('/login'));
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
