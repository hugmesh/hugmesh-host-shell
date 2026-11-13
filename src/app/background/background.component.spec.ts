import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BackgroundComponent } from './background.component';

/**
 * The animated backdrop is purely decorative. These specs lock in:
 *   - the paused() signal contract (default running, toggle() flips it),
 *   - the host [class.is-paused] binding that the CSS reads to halt animation
 *     (this is what the app-shell's bg-toggle button drives), and
 *   - the a11y guarantee that it is non-interactive: no focusable DOM, no
 *     semantic role — so assistive tech and keyboard users skip past it.
 */
describe('BackgroundComponent', () => {
  let component: BackgroundComponent;
  let fixture: ComponentFixture<BackgroundComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BackgroundComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BackgroundComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to running (paused() === false)', () => {
    expect(component.paused()).toBeFalse();
  });

  it('toggle() pauses, and toggling again resumes', () => {
    component.toggle();
    expect(component.paused()).withContext('first toggle pauses').toBeTrue();
    component.toggle();
    expect(component.paused()).withContext('second toggle resumes').toBeFalse();
  });

  it('does NOT carry the is-paused host class while running', () => {
    expect(host.classList.contains('is-paused')).toBeFalse();
  });

  it('reflects paused() onto the host as the is-paused class', () => {
    component.toggle();
    fixture.detectChanges();
    expect(host.classList.contains('is-paused'))
      .withContext('host [class.is-paused] tracks paused()')
      .toBeTrue();

    component.toggle();
    fixture.detectChanges();
    expect(host.classList.contains('is-paused'))
      .withContext('class removed when resumed')
      .toBeFalse();
  });

  describe('stacking — decorative means BEHIND, not merely non-interactive', () => {
    // <app-background> is position:fixed and full-viewport. Its nearest stacking
    // context is the ROOT (main[app-root] is position:absolute but z-index:auto, so
    // it positions WITHOUT creating one), which puts it in direct paint competition
    // with the shell's other root-level children. At z-index:0 it is a POSITIONED
    // element in CSS 2.1 paint step 8 — above the step-3/5 content of every
    // NON-positioned in-flow sibling, i.e. it covers them with an animated gradient.
    //
    // Regression guard for exactly that. It has to be a computed-style check on the
    // real component: pointer-events:none means clicks, hit-testing, element boxes
    // and contrast probes ALL keep reporting a healthy page while content is buried,
    // so no behavioural assertion anywhere can see this. Only the z-index can.
    it('sits in the negative-z layer, so it can never paint over shell content', () => {
      const z = Number(getComputedStyle(host).zIndex);
      expect(Number.isNaN(z))
        .withContext('$z-background must resolve to a NUMBER, not `auto`')
        .toBeFalse();
      expect(z)
        .withContext(
          'the backdrop must paint below in-flow shell chrome. Shell children that ' +
            'never opt into a z-index — [status-gate], the suspension/ban appeal ' +
            'alert — are protected by this and nothing else.',
        )
        .toBeLessThan(0);
    });
  });

  describe('accessibility — decorative and non-interactive', () => {
    it('exposes no focusable elements (nothing in the tab order)', () => {
      const focusable = host.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]',
      );
      expect(focusable.length)
        .withContext('a decorative backdrop must not be keyboard-reachable')
        .toBe(0);
    });

    it('declares no ARIA role (it is semantically inert)', () => {
      expect(host.getAttribute('role')).toBeNull();
    });

    it('renders no meaningful text content for screen readers', () => {
      expect(host.textContent?.trim()).toBe('');
    });
  });
});
