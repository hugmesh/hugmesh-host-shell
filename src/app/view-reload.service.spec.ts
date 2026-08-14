import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { VIEW_RELOAD_EVENT, ViewReloadService } from './view-reload.service';

/** A ViewReloadService whose hard-reload step is OBSERVED instead of performed —
 *  a real location.reload() would navigate the karma runner away mid-spec. */
@Injectable()
class TestableViewReloadService extends ViewReloadService {
  hardReloads = 0;
  protected override hardReload(): void { this.hardReloads++; }
}

describe('ViewReloadService', () => {
  let router: jasmine.SpyObj<Router>;
  let service: TestableViewReloadService;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl'], { url: '/social/matrix' });
    TestBed.configureTestingModule({
      providers: [
        TestableViewReloadService,
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(TestableViewReloadService);
  });

  it('re-mounts the CURRENT url via a skipLocationChange hop (no full browser reload)', async () => {
    router.navigateByUrl.and.resolveTo(true);

    await service.reload();

    expect(router.navigateByUrl.calls.allArgs()).toEqual([
      ['/', { skipLocationChange: true }],
      ['/social/matrix'],
    ]);
    expect(service.hardReloads).toBe(0);
    expect(service.reloadCount()).toBe(1);
  });

  it('broadcasts hug:view-reload so a mounted remote can refresh in place', async () => {
    router.navigateByUrl.and.resolveTo(true);
    let seen = 0;
    const listener = () => { seen++; };
    window.addEventListener(VIEW_RELOAD_EVENT, listener);

    try {
      await service.reload();
    } finally {
      window.removeEventListener(VIEW_RELOAD_EVENT, listener);
    }

    expect(seen).toBe(1);
  });

  it('falls back to a FULL browser reload when the router rejects the navigation', async () => {
    // A guard rejection / a remote that throws during route resolution: the one
    // failure mode a Reload button must never respond to by doing nothing.
    router.navigateByUrl.and.rejectWith(new Error('guard rejected'));

    await service.reload();

    expect(service.hardReloads).toBe(1);
    expect(service.reloadCount()).toBe(0);
  });

  it('clears busy after a reload so the control never sticks disabled', async () => {
    router.navigateByUrl.and.rejectWith(new Error('boom'));

    expect(service.busy()).toBeFalse();
    await service.reload();
    expect(service.busy()).toBeFalse();
  });

  it('ignores a re-entrant reload while one is already in flight', async () => {
    let release!: (v: boolean) => void;
    router.navigateByUrl.and.returnValue(new Promise<boolean>((res) => { release = res; }));

    const first = service.reload();
    expect(service.busy()).toBeTrue();
    // Second press while busy: must NOT queue a second navigation pair.
    await service.reload();
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);

    router.navigateByUrl.and.resolveTo(true);
    release(true);
    await first;
    expect(service.busy()).toBeFalse();
  });
});
