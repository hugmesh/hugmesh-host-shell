import { TestBed } from '@angular/core/testing';
import { SessionService, SnapSession } from './session.service';

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

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionService);
  });

  afterEach(() => localStorage.clear());

  it('reads the canonical snap.session localStorage key', () => {
    expect(service.loggedIn()).toBeFalse();
    service.set(makeSession());
    expect(localStorage.getItem('snap.session')).withContext('writes the canonical key').not.toBeNull();
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

  it('gates fullyRegistered on registrationComplete === true', () => {
    service.set(makeSession({ registrationComplete: false }));
    expect(service.fullyRegistered()).toBeFalse();
    service.set(makeSession({ registrationComplete: true }));
    expect(service.fullyRegistered()).toBeTrue();
  });

  it('clear() removes the key and drops loggedIn', () => {
    service.set(makeSession());
    service.clear();
    expect(localStorage.getItem('snap.session')).toBeNull();
    expect(service.loggedIn()).toBeFalse();
  });

  it('re-reads the signal on the snap-session-change broadcast (remote wrote the session)', () => {
    expect(service.isAdmin()).toBeFalse();
    // Simulate the login remote writing snap.session, then broadcasting.
    localStorage.setItem('snap.session', JSON.stringify(makeSession({ roles: ['admin'] })));
    window.dispatchEvent(new Event('snap-session-change'));
    expect(service.isAdmin()).withContext('host re-reads on broadcast').toBeTrue();
  });

  it('re-reads the signal on a cross-tab storage event for snap.session', () => {
    expect(service.fullyRegistered()).toBeFalse();
    localStorage.setItem('snap.session', JSON.stringify(makeSession({ registrationComplete: true })));
    window.dispatchEvent(new StorageEvent('storage', { key: 'snap.session' }));
    expect(service.fullyRegistered()).toBeTrue();
  });

  it('ignores storage events for unrelated keys', () => {
    service.set(makeSession({ registrationComplete: true }));
    localStorage.setItem('other.key', 'x');
    window.dispatchEvent(new StorageEvent('storage', { key: 'other.key' }));
    expect(service.fullyRegistered()).toBeTrue();
  });
});
