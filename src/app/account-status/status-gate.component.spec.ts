import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StatusGateComponent, APPEAL_ROUTE } from './status-gate.component';
import { AccountStatusService } from './account-status.service';
import { AccountStatus } from './account-status.model';

/** Controllable stand-in for AccountStatusService — drives the component purely
 *  off the two computeds it reads (status + curtailed), no HTTP. */
class StubStatusService {
  readonly status = signal<AccountStatus>({ status: 'active' });
  readonly curtailed = signal<boolean>(false);
  loadCalls = 0;
  load(): Promise<void> {
    this.loadCalls++;
    return Promise.resolve();
  }
}

describe('StatusGateComponent', () => {
  let fixture: ComponentFixture<StatusGateComponent>;
  let stub: StubStatusService;

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  function banner(): HTMLElement | null {
    return el().querySelector('[data-testid="status-gate"]');
  }

  beforeEach(async () => {
    stub = new StubStatusService();
    await TestBed.configureTestingModule({
      imports: [StatusGateComponent],
      providers: [
        provideRouter([]),
        { provide: AccountStatusService, useValue: stub },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StatusGateComponent);
  });

  it('creates and calls load() on init', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(stub.loadCalls).toBe(1);
  });

  describe('render gate', () => {
    it('renders NOTHING when active (not curtailed)', () => {
      stub.curtailed.set(false);
      stub.status.set({ status: 'active' });
      fixture.detectChanges();
      expect(banner()).toBeNull();
    });

    it('renders the banner when suspended', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'suspended', until: '2026-07-01T00:00:00Z' });
      fixture.detectChanges();
      expect(banner()).not.toBeNull();
      expect(banner()!.getAttribute('data-status')).toBe('suspended');
    });

    it('renders the banner when banned', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'banned' });
      fixture.detectChanges();
      expect(banner()).not.toBeNull();
      expect(banner()!.getAttribute('data-status')).toBe('banned');
    });
  });

  describe('ACCESSIBILITY', () => {
    beforeEach(() => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'suspended' });
      fixture.detectChanges();
    });

    it('is role=alert with aria-live=assertive', () => {
      const b = banner()!;
      expect(b.getAttribute('role')).toBe('alert');
      expect(b.getAttribute('aria-live')).toBe('assertive');
    });

    it('the dismiss control is a real button with an aria-label', () => {
      const btn = el().querySelector(
        '[data-testid="status-gate-dismiss"]',
      ) as HTMLButtonElement;
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('aria-label')).toBe('Dismiss account status message');
    });

    it('the appeal link is a router link to the appeal route with an explicit aria-label', () => {
      const link = el().querySelector(
        '[data-testid="status-gate-appeal"]',
      ) as HTMLAnchorElement;
      expect(link).not.toBeNull();
      expect(link.getAttribute('href')).toBe(APPEAL_ROUTE);
      expect(link.getAttribute('aria-label')).toContain('Appeal');
    });
  });

  describe('content', () => {
    it('shows a suspended heading + expiry in the detail', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'suspended', until: '2026-07-01T00:00:00Z' });
      fixture.detectChanges();
      const title = el().querySelector('[data-testid="status-gate-title"]')!;
      const detail = el().querySelector('[data-testid="status-gate-detail"]')!;
      expect(title.textContent).toContain('suspended');
      expect(detail.textContent).toContain('suspended');
    });

    it('shows a banned heading and a permanent message', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'banned' });
      fixture.detectChanges();
      const title = el().querySelector('[data-testid="status-gate-title"]')!;
      const detail = el().querySelector('[data-testid="status-gate-detail"]')!;
      expect(title.textContent).toContain('banned');
      expect(detail.textContent!.toLowerCase()).toContain('permanently');
    });

    it('deep-links the appeal page with ?reason=<text> when an audit reason exists', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'suspended', reason: 'repeated spam' });
      fixture.detectChanges();
      const link = el().querySelector(
        '[data-testid="status-gate-appeal"]',
      ) as HTMLAnchorElement;
      // RouterLink serialises queryParams into the href — the same `?reason=`
      // contract login-ui's own blocked-sign-in redirect uses. Assert the
      // decoded value (not the encoding trivia) so the oracle is the contract.
      const href = link.getAttribute('href')!;
      expect(href.startsWith(`${APPEAL_ROUTE}?reason=`))
        .withContext(`href was ${href}`)
        .toBeTrue();
      expect(decodeURIComponent(href.split('?reason=')[1])).toBe('repeated spam');
    });

    it('links the BARE appeal route when no reason was recorded (no dangling ?reason=)', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'banned' });
      fixture.detectChanges();
      const link = el().querySelector(
        '[data-testid="status-gate-appeal"]',
      ) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(APPEAL_ROUTE);
    });

    it('renders the reason when present, omits it when absent', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'suspended', reason: 'repeated spam' });
      fixture.detectChanges();
      const reason = el().querySelector('[data-testid="status-gate-reason"]');
      expect(reason).not.toBeNull();
      expect(reason!.textContent).toContain('repeated spam');

      stub.status.set({ status: 'suspended' });
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="status-gate-reason"]')).toBeNull();
    });
  });

  describe('dismiss', () => {
    it('hides the banner for this load when dismissed', () => {
      stub.curtailed.set(true);
      stub.status.set({ status: 'banned' });
      fixture.detectChanges();
      expect(banner()).not.toBeNull();

      (el().querySelector('[data-testid="status-gate-dismiss"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(banner())
        .withContext('banner hides after dismiss even while still curtailed')
        .toBeNull();
    });
  });
});
