import { TestBed } from '@angular/core/testing';
import { SessionService, SnapSession } from './session.service';

function makeSession(overrides: Partial<SnapSession> = {}): SnapSession {
  return {
    id: 'google:alice@gmail.com',
    label: 'alice@gmail.com',
    provider: 'google',
    roles: ['user'],
    bffToken: 'bff-token',
    registrationComplete: false,
    matrix: null,
    mastodon: null,
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
