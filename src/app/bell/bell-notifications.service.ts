import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

interface HugMeshNotification {
  id: string;
  readAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class BellNotificationsService implements OnDestroy {

  private static readonly ENDPOINT = '/bff/user/notifications';
  private static readonly POLL_INTERVAL_MS = 60_000;

  private readonly http = inject(HttpClient);

  private readonly notifications$ = new BehaviorSubject<HugMeshNotification[]>([]);
  private pollSubscription: Subscription | null = null;

  readonly unreadCount$: Observable<number> = this.notifications$.pipe(
    map((ns) => ns.filter((n) => n.readAt === null).length),
  );

  // Start polling — call once when the user is authenticated
  startPolling(): void {
    if (this.pollSubscription) { return; }
    this.pollSubscription = timer(0, BellNotificationsService.POLL_INTERVAL_MS).pipe(
      switchMap(() => this.http
        .get<HugMeshNotification[]>(BellNotificationsService.ENDPOINT)
        .pipe(catchError(() => of([])))),
    ).subscribe((ns) => this.notifications$.next(ns));
  }

  stopPolling(): void {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = null;
    this.notifications$.next([]);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}
