import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import {
  CAPABILITIES_ENDPOINT,
  CapabilitiesService,
} from './capabilities.service';
import { FederationCapability } from './capability.model';

function cap(over: Partial<FederationCapability> = {}): FederationCapability {
  return { slug: 'matrix', installed: true, mountAt: '/social/matrix', requiresRole: 'matrix', ...over };
}

describe('CapabilitiesService', () => {
  let service: CapabilitiesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CapabilitiesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flush(body: FederationCapability[]): void {
    httpMock.expectOne(CAPABILITIES_ENDPOINT).flush(body);
  }

  describe('USER-SITUATIONAL — load + installed predicate', () => {
    it('reports a present+enabled service as installed', async () => {
      const p = service.load();
      flush([cap({ slug: 'matrix', installed: true })]);
      await p;
      expect(service.installed('matrix')).toBeTrue();
      expect(service.loaded()).toBeTrue();
    });

    it('reports a registered-but-disabled service as NOT installed (grey by STATE)', async () => {
      const p = service.load();
      flush([cap({ slug: 'mastodon', installed: false })]);
      await p;
      expect(service.installed('mastodon')).toBeFalse();
    });

    it('reports a NEVER-registered (absent) service as NOT installed (grey by ABSENCE)', async () => {
      const p = service.load();
      flush([cap({ slug: 'matrix', installed: true })]);
      await p;
      // 'games' never appears in the list -> absent -> not installed.
      expect(service.installed('games')).toBeFalse();
    });

    it('distinguishes a mix of installed and absent/disabled services', async () => {
      const p = service.load();
      flush([
        cap({ slug: 'matrix', installed: true }),
        cap({ slug: 'forum', installed: false }),
      ]);
      await p;
      expect(service.installed('matrix')).toBeTrue();
      expect(service.installed('forum')).toBeFalse();
      expect(service.installed('games')).toBeFalse();
    });
  });

  describe('load-once sharing', () => {
    it('concurrent load() callers share ONE fetch (menu + cards)', async () => {
      const a = service.load();
      const b = service.load();
      // Exactly one outstanding request despite two callers.
      const req = httpMock.expectOne(CAPABILITIES_ENDPOINT);
      req.flush([cap({ slug: 'matrix', installed: true })]);
      await Promise.all([a, b]);
      expect(service.installed('matrix')).toBeTrue();
    });

    it('a second load() after completion does NOT re-fetch unless forced', async () => {
      const first = service.load();
      flush([cap({ slug: 'matrix', installed: true })]);
      await first;

      await service.load(); // no force -> no new request (verify() would fail otherwise)

      const forced = service.load(true);
      flush([cap({ slug: 'matrix', installed: false })]);
      await forced;
      expect(service.installed('matrix')).toBeFalse();
    });
  });

  describe('GRACEFUL DEGRADATION — never hard-fails', () => {
    it('a failed fetch leaves an empty map (everything greyed) and records the error', async () => {
      const p = service.load();
      httpMock.expectOne(CAPABILITIES_ENDPOINT).flush('boom', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await p;
      expect(service.installed('matrix')).toBeFalse();
      expect(service.loaded()).toBeTrue();
      expect(service.loadError().length).toBeGreaterThan(0);
    });

    it('a non-array body is treated as empty', async () => {
      const p = service.load();
      httpMock
        .expectOne(CAPABILITIES_ENDPOINT)
        .flush({ unexpected: true } as unknown as FederationCapability[]);
      await p;
      expect(service.installed('matrix')).toBeFalse();
    });
  });
});
