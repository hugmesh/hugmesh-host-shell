import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotificationToastComponent } from './notification-toast.component';
import { NotificationToastService, SseToastEvent } from './notification-toast.service';

/** Service double: the component only reads the `toasts` signal, so the stub
 *  carries just that — no SSE stream, no timers. */
class NotificationToastServiceStub {
  readonly toasts = signal<SseToastEvent[]>([
    { id: 'n1', category: 'mention', title: 'You were mentioned', body: 'in #general' },
  ]);
}

/**
 * Toast PLACEMENT (issue #19): notifications live in the UPPER-RIGHT of the
 * screen — and in the UPPER-LEFT under RTL locales. The stylesheet uses CSS
 * LOGICAL properties (inset-block-start / inset-inline-end), so these specs
 * assert the real, rendered geometry in BOTH directions rather than the
 * declaration text: the same one rule must resolve to the right edge under
 * ltr and to the left edge under dir="rtl", with no JS direction switch.
 */
describe('NotificationToastComponent — placement', () => {
  let fixture: ComponentFixture<NotificationToastComponent>;
  let region: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationToastComponent],
      providers: [
        { provide: NotificationToastService, useValue: new NotificationToastServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationToastComponent);
    fixture.detectChanges();
    region = (fixture.nativeElement as HTMLElement).querySelector('.toast-region') as HTMLElement;
  });

  afterEach(() => {
    // Never leak a direction flip into other suites.
    document.documentElement.removeAttribute('dir');
  });

  /** 1.5rem at the root font size — the region's offset from the viewport edges. */
  function edgeOffsetPx(): number {
    return 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
  }

  it('renders the toast region fixed at the TOP of the viewport', () => {
    expect(region).withContext('a visible toast renders the region').toBeTruthy();
    expect(getComputedStyle(region).position).toBe('fixed');
    expect(region.getBoundingClientRect().top)
      .withContext('upper edge: inset-block-start puts the stack at the top')
      .toBeCloseTo(edgeOffsetPx(), 0);
  });

  it('sits at the RIGHT edge in LTR', () => {
    const rect = region.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    expect(viewport - rect.right)
      .withContext('inset-inline-end resolves to the right edge under ltr')
      .toBeCloseTo(edgeOffsetPx(), 0);
  });

  it('sits at the LEFT edge under an RTL document direction — same CSS, no JS switch', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    // Pure style recomputation: no detectChanges needed, nothing in the
    // component reacts to direction — that is the point of logical properties.
    const rect = region.getBoundingClientRect();
    expect(rect.left)
      .withContext('inset-inline-end resolves to the left edge under rtl')
      .toBeCloseTo(edgeOffsetPx(), 0);
  });

  it('renders each toast with its title and body', () => {
    const toast = region.querySelector('.toast') as HTMLElement;
    expect(toast).toBeTruthy();
    expect(toast.querySelector('.toast-title')?.textContent?.trim()).toBe('You were mentioned');
    expect(toast.querySelector('.toast-body')?.textContent?.trim()).toBe('in #general');
  });
});
