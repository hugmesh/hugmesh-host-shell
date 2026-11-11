import { Injectable, Injector, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** The guided-task catalogue the admin remote's 'Guided tasks' console loads. No
 *  admin-bff implements it yet, so on a deployment without that backend it answers 404. */
export const ADMIN_TASKS_ENDPOINT = '/bff/admin/tasks';

/**
 * Holds the server-confirmed answer to "does this deployment have a backend for the
 * Guided tasks console?". Dark by default, like WorkloadConsoleProbeService:
 * `available()` is true only after the catalogue answered 2xx with a `tasks` array.
 * A 404 (no admin-bff serves the surface), any other HTTP error, an HTML body (an SPA
 * fallback fails the JSON parse), a body without a `tasks` array, a network failure or
 * a missing HttpClient all leave it false, so the submenu never links a dead console.
 * The admin remote keeps the route mounted and explains the missing backend on a direct
 * visit; this only decides whether the submenu entry is offered.
 */
@Injectable({ providedIn: 'root' })
export class AdminTasksProbeService {
  private readonly injector = inject(Injector);

  /** True only after a probe found a task catalogue for the current admin session. */
  readonly available = signal(false);

  /** Bumped by every probe() and reset() so a slow response from an earlier
   *  session cannot light the entry for a later one. */
  private generation = 0;

  /** Ask the server. Never throws; any failure keeps (or sets) the entry dark. */
  async probe(): Promise<void> {
    const mine = ++this.generation;
    let ok = false;
    try {
      const http = this.injector.get(HttpClient);
      const body = await firstValueFrom(http.get<unknown>(ADMIN_TASKS_ENDPOINT));
      ok = Array.isArray((body as { tasks?: unknown } | null)?.tasks);
    } catch {
      ok = false;
    }
    if (mine === this.generation) this.available.set(ok);
  }

  /** Back to dark (signed out, or no longer an admin). Invalidates a probe in flight. */
  reset(): void {
    this.generation++;
    this.available.set(false);
  }
}
