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
