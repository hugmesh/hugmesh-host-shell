import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { AccountStatusService, ME_ENDPOINT } from './account-status.service';
import { SessionService, SnapSession } from '../session.service';

function session(over: Partial<SnapSession> = {}): SnapSession {
  return {
    id: 'google:alice@example.com',
    label: 'alice@example.com',
    provider: 'google',
    roles: ['user'],
    registrationComplete: true,
    ...over,
  };
}

describe('AccountStatusService', () => {
  let service: AccountStatusService;
  let sessionSvc: SessionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AccountStatusService);
    sessionSvc = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('USER-SITUATIONAL — reads own status from /bff/me', () => {
    it('reads a suspended status (curtailed=true) for a logged-in caller', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock
        .expectOne(ME_ENDPOINT)
        .flush({ status: 'suspended', until: '2026-07-01T00:00:00Z' });
      await p;
      expect(service.status().status).toBe('suspended');
      expect(service.status().until).toBe('2026-07-01T00:00:00Z');
      expect(service.curtailed()).toBeTrue();
      expect(service.loaded()).toBeTrue();
    });

    it('reads a banned status (curtailed=true)', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'banned', reason: 'tos' });
      await p;
      expect(service.status().status).toBe('banned');
      expect(service.curtailed()).toBeTrue();
    });

    it('an active status is NOT curtailed (no banner)', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'active' });
      await p;
      expect(service.curtailed()).toBeFalse();
    });
  });

  describe('GRACEFUL DEGRADE — absent status field', () => {
    it('treats a /me body with NO status field as active (curtailed=false)', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock
        .expectOne(ME_ENDPOINT)
        .flush({ id: 'google:alice@example.com', roles: ['user'] });
      await p;
      expect(service.status().status).toBe('active');
      expect(service.curtailed()).toBeFalse();
    });
  });

  describe('FAIL-OPEN on read error — informational, never a block', () => {
    it('a 503 leaves the status active (no banner) and records the error', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush('boom', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await p;
      expect(service.status().status).toBe('active');
      expect(service.curtailed()).toBeFalse();
      expect(service.loaded()).toBeTrue();
      expect(service.loadError().length).toBeGreaterThan(0);
    });

    it('a network error fails open to active', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock
        .expectOne(ME_ENDPOINT)
        .error(new ProgressEvent('network'));
      await p;
      expect(service.curtailed()).toBeFalse();
    });
  });

  describe('ANONYMOUS — never reads, never shows', () => {
    it('does NOT issue a request when signed out and reports active', async () => {
      // no session set
      await service.load();
      // httpMock.verify() in afterEach proves zero requests were made
      expect(service.status().status).toBe('active');
      expect(service.curtailed()).toBeFalse();
      expect(service.loaded()).toBeTrue();
    });

    it('curtailed() is false even if a stale curtailed status was read, once signed out', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'banned' });
      await p;
      expect(service.curtailed()).toBeTrue();

      sessionSvc.clear();
      // status() / curtailed() are gated on loggedIn() — clearing hides the banner
      expect(service.curtailed()).toBeFalse();
      expect(service.status().status).toBe('active');
    });
  });

  describe('SESSION SYNC — /bff/me truth lands in SnapSession.status (the guard input)', () => {
    it('a curtailed /bff/me read patches session.status (roleHomeGuard sees it synchronously)', async () => {
      sessionSvc.set(session());
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'suspended' });
      await p;
      expect(sessionSvc.session()?.status).toBe('suspended');
      expect(sessionSvc.curtailed()).toBeTrue();
    });

    it('a later ACTIVE read clears a previously-synced curtailment (un-suspension)', async () => {
      sessionSvc.set(session({ status: 'banned' }));
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'active' });
      await p;
      expect(sessionSvc.session()?.status).toBe('active');
      expect(sessionSvc.curtailed()).toBeFalse();
    });

    it('a FAILED read leaves the last-known session status untouched (an error is not an un-suspension)', async () => {
      sessionSvc.set(session({ status: 'suspended' }));
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush('boom', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await p;
      // the banner's own read degrades to active (fail-open, informational)…
      expect(service.curtailed()).toBeFalse();
      // …but the session keeps the last server truth until a SUCCESSFUL re-read.
      expect(sessionSvc.session()?.status).toBe('suspended');
    });

    it('a steady status does not rewrite the session (no localStorage/broadcast churn)', async () => {
      sessionSvc.set(session({ status: 'suspended' }));
      const patchSpy = spyOn(sessionSvc, 'patch').and.callThrough();
      const p = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'suspended' });
      await p;
      expect(patchSpy).not.toHaveBeenCalled();
      expect(sessionSvc.session()?.status).toBe('suspended');
    });
  });

  describe('load-once sharing', () => {
    it('concurrent load() callers share ONE fetch', async () => {
      sessionSvc.set(session());
      const a = service.load();
      const b = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'suspended' });
      await Promise.all([a, b]);
      expect(service.curtailed()).toBeTrue();
    });

    it('force re-reads after completion', async () => {
      sessionSvc.set(session());
      const first = service.load();
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'suspended' });
      await first;
      expect(service.curtailed()).toBeTrue();

      const forced = service.load(true);
      httpMock.expectOne(ME_ENDPOINT).flush({ status: 'active' });
      await forced;
      expect(service.curtailed()).toBeFalse();
    });
  });
});
