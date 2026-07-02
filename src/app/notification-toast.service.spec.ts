import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NotificationToastService, SseToastEvent, parseSseField } from './notification-toast.service';

describe('parseSseField', () => {
  it('splits "name:value" with no space (the real Spring wire format)', () => {
    expect(parseSseField('data:{"id":"n1"}')).toEqual({ name: 'data', value: '{"id":"n1"}' });
  });

  it('strips exactly one leading space, per the SSE spec allowance', () => {
    expect(parseSseField('data: {"id":"n1"}')).toEqual({ name: 'data', value: '{"id":"n1"}' });
  });

  it('preserves a second leading space (only ONE is stripped)', () => {
    expect(parseSseField('data:  extra')).toEqual({ name: 'data', value: ' extra' });
  });

  it('splits on the FIRST colon only (value may itself contain colons)', () => {
    expect(parseSseField('data:{"time":"12:30:00"}')).toEqual({
      name: 'data',
      value: '{"time":"12:30:00"}',
    });
  });

  it('returns null for a blank line (event terminator)', () => {
    expect(parseSseField('')).toBeNull();
  });

  it('returns null for a comment line (starts with ":")', () => {
    expect(parseSseField(': keepalive')).toBeNull();
  });

  it('returns null for a line with no colon at all', () => {
    expect(parseSseField('not-a-field')).toBeNull();
  });
});

describe('NotificationToastService', () => {
  let service: NotificationToastService;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationToastService);
  });

  afterEach(() => {
    service.stop();
    globalThis.fetch = originalFetch;
  });

  /** Build a fake fetch `Response` whose body is a ReadableStream emitting the
   *  given raw SSE text chunks, then closing. */
  function sseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return { ok: true, body } as unknown as Response;
  }

  /** Real (non-fakeAsync) macrotask wait for the fetch → `reader.read()`
   *  promise chain to settle — see snapdragon-user-ui's identical helper for
   *  why this needs a genuine timer rather than `tick()`/`flushMicrotasks()`
   *  (native `ReadableStream` internals aren't reliably zone-patched). */
  async function flushStream(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  it('REGRESSION: parses the REAL Spring wire format — "data:" with NO space before the JSON', async () => {
    // This is the bug this fix closes: Spring WebFlux's
    // ServerSentEventHttpMessageWriter emits "data:" with no space, so the old
    // exact `line.startsWith('data: ')` check matched zero real events — the
    // "shipped" toast never actually fired against a live user-bff.
    globalThis.fetch = (() =>
      Promise.resolve(
        sseResponse([
          'id:n11\n',
          'event:role-change\n',
          'data:{"id":"n11","category":"role-change","title":"No-space wire format"}\n\n',
        ]),
      )) as typeof fetch;

    service.start();
    await flushStream();

    expect(service.toasts().map((t) => t.id)).toEqual(['n11']);
    expect(service.toasts()[0].title).toBe('No-space wire format');
  });

  it('also tolerates a leading space after the colon (spec-compliant either way)', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        sseResponse(['data: {"id":"n12","category":"role-change","title":"With space"}\n\n']),
      )) as typeof fetch;

    service.start();
    await flushStream();

    expect(service.toasts().map((t) => t.id)).toEqual(['n12']);
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
    // Patch fetch so it never resolves (hangs), simulating an active stream
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise(() => {});
    try {
      service.start();
      service.start(); // second call must be a no-op
    } finally {
      service.stop();
      globalThis.fetch = originalFetch;
    }
    tick(0);
  }));

  it('start_usesCookieCredentialsAndNoBearer', fakeAsync(() => {
    // The SSE stream authenticates via the HttpOnly bff_ cookie (credentials:
    // 'include'); the browser sends NO Authorization bearer (the gateway exchanges
    // the cookie server-side).
    let capturedInit: RequestInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Promise<Response>(() => {}); // hang: keep the stream "open"
    }) as typeof fetch;
    try {
      service.start();
      expect(capturedInit?.credentials).toBe('include');
      expect((capturedInit?.headers as Record<string, string> | undefined)?.['Authorization'])
        .toBeUndefined();
    } finally {
      service.stop();
      globalThis.fetch = originalFetch;
    }
    tick(0);
  }));
});
