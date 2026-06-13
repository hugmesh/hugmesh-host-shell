import { TestBed } from '@angular/core/testing';

import { HomeServicesService } from './home-services.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { SessionService, SnapSession } from '../session.service';
import { ServiceCard } from './service-card.model';

function session(over: Partial<SnapSession> = {}): SnapSession {
  return {
    id: 'google:alice@example.com',
    label: 'alice',
    provider: 'google',
    roles: ['user'],
    bffToken: 't',
    registrationComplete: true,
    matrix: null,
    mastodon: null,
    ...over,
  };
}

describe('HomeServicesService — card projection', () => {
  let service: HomeServicesService;
  let session$: SessionService;
  let caps: CapabilitiesStub;

  beforeEach(() => {
    localStorage.clear();
    caps = new CapabilitiesStub();
    TestBed.configureTestingModule({
      providers: [{ provide: CapabilitiesService, useValue: caps }],
    });
    session$ = TestBed.inject(SessionService);
    service = TestBed.inject(HomeServicesService);
  });

  afterEach(() => localStorage.clear());

  const card = (id: string): ServiceCard => service.cards().find((c) => c.id === id)!;

  it('always renders the full catalog (matrix/mastodon/forum/games/tube/owncast/admin/mod)', () => {
    expect(service.cards().map((c) => c.id)).toEqual([
      'matrix', 'mastodon', 'forum', 'games', 'tube', 'owncast', 'admin', 'mod',
    ]);
  });

  describe('USER-SITUATIONAL — anonymous (signed out)', () => {
    it('every card is disabled (services need sign-in; consoles need a role)', () => {
      expect(service.cards().every((c) => c.state !== 'enabled')).toBeTrue();
    });

    it('an optional-service card prompts to sign in', () => {
      expect(card('matrix').state).toBe('role');
      expect(card('matrix').disabledReason).toContain('Sign in');
    });

    it('the admin card prompts to sign in as an administrator', () => {
      expect(card('admin').state).toBe('role');
      expect(card('admin').disabledReason).toContain('an administrator');
    });
  });

  describe('USER-SITUATIONAL — plain registered user', () => {
    beforeEach(() => session$.set(session({ roles: ['user'], registrationComplete: true })));

    it('enables installed social + forum + games', () => {
      expect(card('matrix').state).toBe('enabled');
      expect(card('mastodon').state).toBe('enabled');
      expect(card('forum').state).toBe('enabled');
      expect(card('games').state).toBe('enabled');
    });

    it('greys the admin and mod consoles with a "sign in as …" reason', () => {
      expect(card('admin').state).toBe('role');
      expect(card('admin').disabledReason).toContain('an administrator');
      expect(card('mod').state).toBe('role');
      expect(card('mod').disabledReason).toContain('a moderator');
    });
  });

  describe('USER-SITUATIONAL — unregistered user', () => {
    beforeEach(() => session$.set(session({ registrationComplete: false })));

    it('greys the social cards with a REGISTRATION reason (not absence)', () => {
      expect(card('matrix').state).toBe('registration');
      expect(card('matrix').disabledReason).toContain('registration');
    });

    it('still enables non-social installed services (forum/games/tube/owncast need no registration)', () => {
      expect(card('forum').state).toBe('enabled');
      expect(card('games').state).toBe('enabled');
      expect(card('tube').state).toBe('enabled');
      expect(card('owncast').state).toBe('enabled');
    });
  });

  describe('USER-SITUATIONAL — admin and mod', () => {
    it('admin sees the Admin console enabled', () => {
      session$.set(session({ roles: ['admin'] }));
      expect(card('admin').state).toBe('enabled');
    });

    it('mod sees the Moderation console enabled but Admin greyed', () => {
      session$.set(session({ roles: ['mod'] }));
      expect(card('mod').state).toBe('enabled');
      expect(card('admin').state).toBe('role');
    });
  });

  describe('ABSENT optional service -> greyed card by install-state', () => {
    beforeEach(() => session$.set(session({ roles: ['admin'], registrationComplete: true })));

    it('a NOT-installed service renders absent with "not available" (even for an admin)', () => {
      caps.setAbsent('games');
      expect(card('games').state).toBe('absent');
      expect(card('games').disabledReason).toContain('not available on this deployment');
    });

    it('tube absent (no GPU node) renders absent for admin', () => {
      caps.setAbsent('tube');
      expect(card('tube').state).toBe('absent');
      expect(card('tube').disabledReason).toContain('not available on this deployment');
    });

    it('owncast absent (no GPU node) renders absent for admin', () => {
      caps.setAbsent('owncast');
      expect(card('owncast').state).toBe('absent');
      expect(card('owncast').disabledReason).toContain('not available on this deployment');
    });

    it('install-state ABSENCE dominates over the registration gate', () => {
      session$.set(session({ registrationComplete: false }));
      caps.setAbsent('matrix');
      // Both gates fail; absence is reported (it's unrecoverable on this deploy).
      expect(card('matrix').state).toBe('absent');
    });

    it('a registered-but-disabled service is still absent (installed=false)', () => {
      caps.installedSlugs.set(new Set(['matrix', 'mastodon', 'games'])); // forum dropped
      expect(card('forum').state).toBe('absent');
    });

    it('admin/mod consoles are NEVER absent (core, not federation-registered)', () => {
      caps.installedSlugs.set(new Set()); // nothing installed
      expect(card('admin').state).not.toBe('absent');
      expect(card('mod').state).not.toBe('absent');
    });
  });

  describe('MULTIUSER / CROSS-USER — same install-state, different sessions', () => {
    it('the SAME deployment greys different cards per role (admin vs plain user)', () => {
      session$.set(session({ roles: ['user'] }));
      expect(card('admin').state).toBe('role');

      session$.set(session({ roles: ['admin'] }));
      expect(card('admin').state).toBe('enabled');
    });

    it('a service absent on the deployment is greyed for EVERY role (admin too)', () => {
      caps.setAbsent('forum');
      session$.set(session({ roles: ['admin'] }));
      expect(card('forum').state).toBe('absent');
      session$.set(session({ roles: ['user'] }));
      expect(card('forum').state).toBe('absent');
    });
  });
});
