import { Injectable, signal } from '@angular/core';

export interface SseToastEvent {
  id: string;
  category: string;
  title: string;
  body?: string | null;
}

/**
 * Parse one raw SSE wire line into a `{name, value}` field per the SSE spec:
 * split on the FIRST colon, and strip AT MOST ONE leading space from the
 * value (the spec-mandated allowance — a compliant writer may or may not
 * include it). Returns `null` for a blank line (event terminator), a
 * comment line (starts with `:`), or a line with no colon at all.
 *
 * BUG FIX: this deliberately does NOT use an exact-prefix match like
 * `line.startsWith('data: ')`. Spring WebFlux's `ServerSentEventHttpMessageWriter`
 * (the writer user-bff-api's `UserNotificationController` uses for
 * `GET /bff/user/notifications/events`) emits `data:` with NO space before the
 * JSON payload — verified by disassembling the exact `spring-web-7.0.8.jar`
 * user-bff-api ships. An exact `"data: "` prefix check therefore matched ZERO
 * real events: this toast never actually fired against a live user-bff
 * despite the feature reading as "shipped" end-to-end.
 */
export function parseSseField(line: string): { name: string; value: string } | null {
  if (line === '' || line.startsWith(':')) return null;
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const name = line.slice(0, colon);
  let value = line.slice(colon + 1);
  if (value.startsWith(' ')) value = value.slice(1);
  return { name, value };
}

/**
 * The window event this service re-publishes every parsed SSE frame on, so a
 * FEDERATED REMOTE can react to a live notification WITHOUT opening a second
 * `/bff/user/notifications/events` connection of its own.
 *
 * Why a window event and not a shared service: each native-federation remote
 * bootstraps with its OWN injector, so `inject(NotificationToastService)` inside
 * matrix-ui/mastodon-ui would construct a SEPARATE instance and a SEPARATE
 * stream. Two streams is not merely wasteful — under HTTP/1.1 the browser allows
 * six connections per origin, and every one of them is held open for the
 * server's full 4-minute keepalive window, so a handful of remotes each holding
 * their own would starve ordinary XHR. One stream, re-broadcast, is the only
 * shape that scales with the number of mounted remotes. Mirrors the
 * 'hug-session-change' window seam SessionService already uses.
 */
export const SSE_NOTIFICATION_EVENT = 'hug:sse-notification';

@Injectable({ providedIn: 'root' })
export class NotificationToastService {
  private static readonly SSE_ENDPOINT = '/bff/user/notifications/events';
  private static readonly MAX_TOASTS = 3;
  private static readonly DISMISS_MS = 4_000;
  private static readonly RECONNECT_MS = 5_000;

  readonly toasts = signal<SseToastEvent[]>([]);

  /** Live connection state for the stream — 'idle' before start()/after stop(),
   *  'open' once the server has answered 2xx, 'reconnecting' during the backoff
   *  after the server closed the stream on its keepalive timeout. Exposed so the
   *  shell can HONESTLY tell a user whether live updates are actually flowing
   *  rather than implying they are whenever the feature is compiled in. */
  readonly connection = signal<'idle' | 'open' | 'reconnecting'>('idle');

  private controller: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.controller) { return; }
    this.controller = new AbortController();
    this.consume();
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connection.set('idle');
  }

  addToast(event: SseToastEvent): void {
    this.toasts.update(current => {
      const trimmed = current.length >= NotificationToastService.MAX_TOASTS
        ? current.slice(1)
        : current;
      return [...trimmed, event];
    });
    setTimeout(() => {
      this.toasts.update(current => current.filter(t => t.id !== event.id));
    }, NotificationToastService.DISMISS_MS);
    this.rebroadcast(event);
  }

  /** Re-publish one parsed SSE frame on `window` for the mounted remotes (see
   *  {@link SSE_NOTIFICATION_EVENT}). Guarded for a non-browser document and
   *  fail-soft: a listener that throws must never break the toast pipeline that
   *  the shell's own UI depends on. */
  private rebroadcast(event: SseToastEvent): void {
    if (typeof window === 'undefined') { return; }
    try {
      window.dispatchEvent(new CustomEvent(SSE_NOTIFICATION_EVENT, { detail: event }));
    } catch { /* a listener threw — the shell's own toast is unaffected */ }
  }

  private async consume(): Promise<void> {
    try {
      const response = await fetch(NotificationToastService.SSE_ENDPOINT, {
        credentials: 'include',
        signal: this.controller!.signal,
      });

      if (!response.ok) {
        // Non-2xx (e.g. 401) — stop cleanly, do not reconnect
        this.stop();
        return;
      }

      this.connection.set('open');
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Server closed the stream (e.g. 4-minute SSE timeout) — reconnect after backoff
          if (this.controller) {
            this.connection.set('reconnecting');
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null;
              this.consume();
            }, NotificationToastService.RECONNECT_MS);
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const field = parseSseField(line);
          if (field?.name !== 'data') continue;
          try {
            const event: SseToastEvent = JSON.parse(field.value);
            this.addToast(event);
          } catch {
            // Malformed JSON — skip
          }
        }
      }
    } catch {
      // AbortError from stop() or a network error — stop cleanly
      this.stop();
    }
  }
}
