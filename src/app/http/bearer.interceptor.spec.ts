import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { bearerInterceptor } from './bearer.interceptor';
import { SessionService, SnapSession } from '../session.service';

const SESSION: SnapSession = {
  id: 'google:alice@example.com',
  label: 'alice',
  provider: 'google',
  roles: ['user'],
  bffToken: 'tok-123',
  registrationComplete: true,
  matrix: null,
  mastodon: null,
};

/**
 * The single Bearer/credentials seam for the host HttpClient. These are the
 * USER-SITUATIONAL cases (anonymous vs signed-in) plus the never-clobber rule.
 */
describe('bearerInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: SessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([bearerInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('USER-SITUATIONAL — anonymous (no session)', () => {
    it('sends withCredentials and NO Authorization (public reads stay anonymous)', () => {
      http.get('/api/federation/capabilities').subscribe();
      const req = httpMock.expectOne('/api/federation/capabilities');
      expect(req.request.withCredentials).toBeTrue();
      expect(req.request.headers.has('Authorization')).toBeFalse();
      req.flush([]);
    });
  });

  describe('USER-SITUATIONAL — signed-in', () => {
    it('attaches the session bffToken as a Bearer and withCredentials', () => {
      session.set(SESSION);
      http.get('/bff/whatever').subscribe();
      const req = httpMock.expectOne('/bff/whatever');
      expect(req.request.withCredentials).toBeTrue();
      expect(req.request.headers.get('Authorization')).toBe('Bearer tok-123');
      req.flush({});
    });

    it('never clobbers a caller-set Authorization header', () => {
      session.set(SESSION);
      http
        .get('/bff/whatever', { headers: { Authorization: 'Bearer explicit' } })
        .subscribe();
      const req = httpMock.expectOne('/bff/whatever');
      expect(req.request.headers.get('Authorization')).toBe('Bearer explicit');
      req.flush({});
    });
  });
});
