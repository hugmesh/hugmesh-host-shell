import { Injectable, Injector, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** The admin-bff capability probe for the Workload console. The server answers
 *  200 only to an admin/superadmin holding a live grant while the feature is
 *  enabled, and 404 otherwise (no existence leak). */
export const WORKLOAD_CAPABILITY_ENDPOINT = '/bff/admin/workloads/capability';

/**
 * Holds the server-confirmed answer to "may this session see the Workload
 * console?". Dark by default: `available()` is true only after a probe resolved
 * successfully. A 404, any other HTTP error, a network failure or a missing
 * HttpClient all leave it false, so the host never advertises the console from
 * a static list. The route guard in the admin remote stays the real boundary;
 * this only decides whether the submenu entry is offered.
 */
@Injectable({ providedIn: 'root' })
export class WorkloadConsoleProbeService {
  private readonly injector = inject(Injector);

  /** True only after a probe succeeded for the current admin session. */
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
      await firstValueFrom(http.get<unknown>(WORKLOAD_CAPABILITY_ENDPOINT));
      ok = true;
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
