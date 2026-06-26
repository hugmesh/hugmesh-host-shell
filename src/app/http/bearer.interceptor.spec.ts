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
  registrationComplete: true,
  matrix: null,
  mastodon: null,
};

/**
 * The single credentials seam for the host HttpClient: it ALWAYS sends the HttpOnly
 * session cookie (`withCredentials: true`) and NEVER attaches a browser bearer —
 * the gateway exchanges the `bff_` cookie for the upstream bearer server-side.
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
    it('sends the session cookie via withCredentials and NEVER attaches a browser bearer', () => {
      session.set(SESSION);
      http.get('/bff/whatever').subscribe();
      const req = httpMock.expectOne('/bff/whatever');
      // The HttpOnly bff_ cookie carries auth; the gateway exchanges it for the
      // upstream bearer server-side, so the browser sends no Authorization header.
      expect(req.request.withCredentials).toBeTrue();
      expect(req.request.headers.has('Authorization')).toBeFalse();
      req.flush({});
    });
  });
});
