import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NotificationToastService, SseToastEvent } from './notification-toast.service';

describe('NotificationToastService', () => {
  let service: NotificationToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationToastService);
  });

  it('addToast_appendsToToastsSignal', fakeAsync(() => {
    const evt: SseToastEvent = { id: 'n1', category: 'role-change', title: 'Test' };
    service.addToast(evt);
    expect(service.toasts()).toContain(evt);
    tick(4000); // clean up timer
  }));

  it('addToast_dropsOldestWhenOverThreeToasts', fakeAsync(() => {
    const makeEvt = (i: number): SseToastEvent => ({ id: `n${i}`, category: 'info', title: `Toast ${i}` });
    [1, 2, 3, 4].forEach(i => service.addToast(makeEvt(i)));
    expect(service.toasts().length).toBe(3);
    expect(service.toasts().find(t => t.id === 'n1')).toBeUndefined();
    tick(4000);
  }));

  it('addToast_removesToastAfterDismissTimeout', fakeAsync(() => {
    const evt: SseToastEvent = { id: 'n5', category: 'info', title: 'Dismiss me' };
    service.addToast(evt);
    expect(service.toasts().find(t => t.id === 'n5')).toBeTruthy();
    tick(4000);
    expect(service.toasts().find(t => t.id === 'n5')).toBeUndefined();
  }));

  it('stop_clearsReconnectTimer', fakeAsync(() => {
    // stop() before any start() should be safe
    expect(() => service.stop()).not.toThrow();
    tick(0);
  }));

  it('start_guardsAgainstDoubleStart', fakeAsync(() => {
    // Calling start twice with no real fetch should not throw
    // (controller guard prevents double-start; no real network here)
    const token = 'test-token';
    // Patch fetch so it never resolves (hangs), simulating an active stream
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise(() => {});
    try {
      service.start(token);
      service.start(token); // second call must be a no-op
    } finally {
      service.stop();
      globalThis.fetch = originalFetch;
    }
    tick(0);
  }));
});
