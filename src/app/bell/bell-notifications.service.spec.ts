import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { BellNotificationsService } from './bell-notifications.service';

describe('BellNotificationsService', () => {
  let service: BellNotificationsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BellNotificationsService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(BellNotificationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Stop polling (cancels the subscription and any in-flight inner observable).
    // Then drain any remaining pending requests so verify() does not complain.
    service.stopPolling();
    // Absorb any request that was in-flight when we unsubscribed.
    httpMock.match('/bff/user/notifications');
    httpMock.verify();
  });

  it('should emit 0 before polling starts', () => {
    // BehaviorSubject starts with [] so unreadCount$ synchronously emits 0.
    let emittedCount = -1;
    const sub = service.unreadCount$.subscribe(c => (emittedCount = c));
    sub.unsubscribe();
    expect(emittedCount).toBe(0);
  });

  it('should emit the unread count after polling fetches notifications', fakeAsync(() => {
    service.startPolling();
    // timer(0, 60_000) fires on the async scheduler; tick(0) triggers the first emission.
    tick(0);
    const req = httpMock.expectOne('/bff/user/notifications');
    req.flush([
      { id: '1', readAt: null },
      { id: '2', readAt: '2026-06-24T00:00:00Z' },
      { id: '3', readAt: null },
    ]);
    // Discard the pending t=60_000 periodic task to prevent a second HTTP request.
    discardPeriodicTasks();
    let latestCount = -1;
    service.unreadCount$.subscribe(c => (latestCount = c));
    expect(latestCount).toBe(2);
  }));

  it('should emit 0 when all notifications are read', fakeAsync(() => {
    service.startPolling();
    tick(0);
    const req = httpMock.expectOne('/bff/user/notifications');
    req.flush([{ id: '1', readAt: '2026-06-24T00:00:00Z' }]);
    discardPeriodicTasks();
    let latestCount = -1;
    service.unreadCount$.subscribe(c => (latestCount = c));
    expect(latestCount).toBe(0);
  }));

  it('should emit 0 and continue on HTTP error', fakeAsync(() => {
    service.startPolling();
    tick(0);
    const req = httpMock.expectOne('/bff/user/notifications');
    req.flush('server error', { status: 500, statusText: 'Internal Server Error' });
    discardPeriodicTasks();
    let latestCount = -1;
    service.unreadCount$.subscribe(c => (latestCount = c));
    expect(latestCount).toBe(0);
  }));

  it('should not start a second poll subscription when startPolling is called twice', fakeAsync(() => {
    service.startPolling();
    service.startPolling(); // second call should be a no-op
    tick(0);
    // Only ONE request should be pending — the second startPolling() was a no-op.
    httpMock.expectOne('/bff/user/notifications').flush([]);
    discardPeriodicTasks();
  }));

  it('should stop polling and reset count on stopPolling', fakeAsync(() => {
    service.startPolling();
    tick(0);
    httpMock.expectOne('/bff/user/notifications').flush([{ id: '1', readAt: null }]);
    discardPeriodicTasks();
    service.stopPolling();
    let latestCount = -1;
    service.unreadCount$.subscribe(c => (latestCount = c));
    expect(latestCount).toBe(0);
  }));
});
