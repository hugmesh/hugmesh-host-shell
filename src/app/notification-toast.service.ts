import { Injectable, signal } from '@angular/core';

export interface SseToastEvent {
  id: string;
  category: string;
  title: string;
  body?: string | null;
}

@Injectable({ providedIn: 'root' })
export class NotificationToastService {
  private static readonly SSE_ENDPOINT = '/bff/user/notifications/events';
  private static readonly MAX_TOASTS = 3;
  private static readonly DISMISS_MS = 4_000;
  private static readonly RECONNECT_MS = 5_000;

  readonly toasts = signal<SseToastEvent[]>([]);

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

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Server closed the stream (e.g. 4-minute SSE timeout) — reconnect after backoff
          if (this.controller) {
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
          if (line.startsWith('data: ')) {
            try {
              const event: SseToastEvent = JSON.parse(line.slice(6));
              this.addToast(event);
            } catch {
              // Malformed JSON — skip
            }
          }
        }
      }
    } catch {
      // AbortError from stop() or a network error — stop cleanly
      this.stop();
    }
  }
}
