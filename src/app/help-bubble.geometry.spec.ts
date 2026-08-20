import { Component, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AppComponent } from './app.component';
import { BackgroundComponent } from './background/background.component';
import { NotificationToastComponent } from './notification-toast.component';
import { NotificationToastService } from './notification-toast.service';
import { MenuComponent } from './menu/menu.component';
import { SessionService } from './session.service';
import { CapabilitiesService } from './capabilities/capabilities.service';
import { CapabilitiesStub } from './capabilities/capabilities.stub';

/**
 * ANCHORED HELP BUBBLES — LAYOUT REGRESSION GUARD.
 *
 * Every icon-only chrome control in the shell pairs itself with a `.field-help`
 * span that is revealed as a bubble on hover/focus (bg-toggle, menubar-mode
 * toggle, profile-menu trigger). The bubble is `position: absolute` inside an
 * anchor that SHRINK-WRAPS to its ~2.5rem button.
 *
 * The bug this guards: an absolutely positioned box with `width: auto` is sized
 * shrink-to-fit against the AVAILABLE width — the containing block's width minus
 * the inset offsets — not against `max-width`. Inside a 40px anchor carrying
 * `inset-inline-end: 3rem` the available width is negative, so the box collapsed
 * to its MINIMUM content width (the widest single word) and rendered as a 32px
 * wide, 657px tall column of one-word-per-line vertical text. `max-width` cannot
 * rescue that: it caps a width, it never grants available width.
 *
 * These specs measure the REAL rendered box (global styles.scss + the component
 * stylesheets are loaded into the Karma page) and assert the invariant that a
 * bubble is sized by its own CONTENT clamped by its own `max-width`, never by the
 * width of the little button it hangs off.
 */

/** The bubble's intrinsic (max-content) width, measured in place so it inherits
 *  exactly the same font as the real box. Temporarily overrides the sizing inputs
 *  and restores them, so it observes the element without changing it. */
function intrinsicWidth(el: HTMLElement): number {
  const saved = el.getAttribute('style');
  el.style.setProperty('width', 'max-content', 'important');
  el.style.setProperty('max-width', 'none', 'important');
  el.style.setProperty('inset-inline-end', 'auto', 'important');
  el.style.setProperty('inset-inline-start', 'auto', 'important');
  const w = el.getBoundingClientRect().width;
  if (saved === null) el.removeAttribute('style');
  else el.setAttribute('style', saved);
  return w;
}

/**
 * The idiom-level assertion, run against every anchored bubble.
 *
 * `expected = min(intrinsic content width, the bubble's own max-width)`. Any
 * narrower means the ANCHOR's width leaked into the bubble's sizing, which is
 * precisely the vertical-text defect.
 */
function expectSizesToItsOwnContent(el: HTMLElement, what: string): void {
  // Guard the measurement itself: a display:none ancestor reports 0x0 for
  // everything, which would make the assertions below fail for the wrong reason.
  expect(el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
    .withContext(`${what}: bubble is not laid out at all (a hidden ancestor?) — cannot measure`)
    .toBe(true);

  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const cap = parseFloat(cs.maxWidth);
  expect(Number.isFinite(cap))
    .withContext(`${what}: a revealed bubble must carry a max-width clamp`)
    .toBe(true);

  const intrinsic = intrinsicWidth(el);
  const expected = Math.min(intrinsic, cap);

  expect(rect.width)
    .withContext(
      `${what}: bubble is ${rect.width.toFixed(1)}px wide but its content wants ` +
        `${intrinsic.toFixed(1)}px (capped at ${cap}px) — the anchor's width leaked ` +
        `into the bubble's available width`,
    )
    .toBeGreaterThanOrEqual(expected - 1.5);

  // Human-legible restatement of the same thing: help bubbles are WIDE and SHORT.
  // The defect produced 32 x 657.
  expect(rect.width)
    .withContext(`${what}: bubble collapsed to a narrow column (${rect.width.toFixed(1)}px)`)
    .toBeGreaterThan(120);

  const lineHeight = parseFloat(cs.lineHeight) || 17;
  const lines = Math.round((rect.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lineHeight);
  expect(lines)
    .withContext(`${what}: bubble wrapped onto ${lines} lines (${rect.height.toFixed(1)}px tall)`)
    .toBeLessThanOrEqual(6);

  expect(rect.width)
    .withContext(`${what}: a help bubble must be wider than it is tall`)
    .toBeGreaterThan(rect.height);
}

/** The bubble must stay in the accessibility tree at all times — the reveal is a
 *  VISUAL affordance, never the thing that makes the help exist. */
function expectStaysInA11yTree(control: HTMLElement, help: HTMLElement, what: string): void {
  const describedby = control.getAttribute('aria-describedby');
  expect(describedby)
    .withContext(`${what}: control must reference its help via aria-describedby`)
    .toBe(help.id);
  const cs = getComputedStyle(help);
  expect(cs.display).withContext(`${what}: help must not be display:none`).not.toBe('none');
  expect(help.textContent!.trim().length)
    .withContext(`${what}: help must carry real text`)
    .toBeGreaterThan(10);
}

@Component({
  selector: 'app-background',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '',
})
class BackgroundStub {
  readonly paused = signal(false);
  toggle() {}
}

@Component({ selector: 'hug-notification-toast', standalone: true, template: '' })
class NotificationToastStub {}

class SessionStub {
  loggedIn = signal(true);
  fullyRegistered = signal(true);
  isUser = computed(() => this.loggedIn());
  isAdmin = signal(false);
  isMod = signal(false);
  isSuperadmin = signal(false);
  isGames = signal(false);
  isGamesAdmin = signal(false);
  roles = signal<string[]>([]);
  session = signal<{ label: string } | null>({ label: 'alice' });
  hasRole(role: string) {
    return this.roles().some((r) => r.toLowerCase() === role.toLowerCase());
  }
  async clear() {
    this.loggedIn.set(false);
    this.session.set(null);
  }
}

describe('anchored help bubbles size to their content, not to their anchor', () => {
  describe('floating chrome toggles (bg-toggle + menubar-mode)', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          NotificationToastService,
          { provide: SessionService, useValue: new SessionStub() },
          { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        ],
      })
        .overrideComponent(AppComponent, {
          remove: { imports: [BackgroundComponent, NotificationToastComponent] },
          add: { imports: [BackgroundStub, NotificationToastStub] },
        })
        .compileComponents();
    });

    it('renders every .bg-toggle__help as a wide, short bubble (not a vertical column)', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const bubbles = Array.from(el.querySelectorAll<HTMLElement>('.bg-toggle__help'));
      // Both floating controls exist while signed in: the animation toggle and the
      // menubar-mode toggle that reuses its bubble class wholesale.
      expect(bubbles.length)
        .withContext('both floating chrome controls must carry a help bubble')
        .toBeGreaterThanOrEqual(2);

      for (const help of bubbles) {
        const control = el.querySelector<HTMLElement>(`[aria-describedby="${help.id}"]`)!;
        expect(control).withContext(`#${help.id} must have a describing control`).toBeTruthy();
        // Reveal it the way a keyboard user does, then measure what they see.
        control.focus();
        expectSizesToItsOwnContent(help, `#${help.id}`);
        expectStaysInA11yTree(control, help, `#${help.id}`);
      }
    });

    it('reveals the bubble on focus-within and keeps it laid out while hidden', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const help = el.querySelector<HTMLElement>('#bg-toggle-help')!;
      const btn = el.querySelector<HTMLElement>('[data-testid="bg-toggle"]')!;

      // Hidden by default, but still a laid-out box (visibility, not display), so
      // the reveal cannot change its size.
      expect(getComputedStyle(help).visibility).toBe('hidden');
      const hiddenWidth = help.getBoundingClientRect().width;

      btn.focus();
      if (btn.closest('.bg-toggle-control')!.matches(':focus-within')) {
        expect(getComputedStyle(help).visibility)
          .withContext('focus-within must reveal the bubble')
          .toBe('visible');
      }
      expect(help.getBoundingClientRect().width)
        .withContext('reveal must not resize the bubble')
        .toBeCloseTo(hiddenWidth, 0);
    });
  });

  describe('profile-menu trigger', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [MenuComponent],
        providers: [
          provideRouter([]),
          { provide: SessionService, useValue: new SessionStub() },
          { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
        ],
      }).compileComponents();
    });

    it('renders .profile-menu__help as a wide, short bubble (not a vertical column)', () => {
      const fixture = TestBed.createComponent(MenuComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      // The Karma iframe is narrower than bootstrap's `lg` breakpoint, so
      // `.navbar-collapse` is display:none and NOTHING inside the bar has a box.
      // Open it the way bootstrap's own toggler does; this is about the harness
      // viewport, not about the bubble under test.
      el.querySelector('#navbarMain')!.classList.add('show');

      // …and in that collapsed state bootstrap stacks `.navbar-nav` as a COLUMN,
      // so every <li> stretches to the full bar width and the anchor accidentally
      // has hundreds of px to give away. The bug only shows up in the EXPANDED
      // (>= lg) bar, where the <li> is a shrink-wrapped flex item about as wide as
      // its `min-width: 7rem` trigger button. Pin that width so the spec measures
      // the desktop geometry regardless of the harness window size.
      const anchor = el.querySelector<HTMLElement>('.profile-menu')!;
      anchor.style.width = '7rem';

      const help = el.querySelector<HTMLElement>('#profile-trigger-help')!;
      expect(help).withContext('profile trigger help must exist').toBeTruthy();
      const trigger = el.querySelector<HTMLElement>('[aria-describedby="profile-trigger-help"]')!;
      expect(trigger).withContext('profile trigger must describe itself').toBeTruthy();

      trigger.focus();
      expectSizesToItsOwnContent(help, '#profile-trigger-help');
      expectStaysInA11yTree(trigger, help, '#profile-trigger-help');
    });
  });
});
