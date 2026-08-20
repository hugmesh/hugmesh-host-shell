import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AppComponent } from './app.component';
import { BackgroundComponent } from './background/background.component';
import { NotificationToastComponent } from './notification-toast.component';
import { NotificationToastService } from './notification-toast.service';
import { MenuComponent } from './menu/menu.component';
import { HeaderControlsComponent } from './header/header-controls.component';
import { SessionService } from './session.service';
import { CapabilitiesService } from './capabilities/capabilities.service';
import { CapabilitiesStub } from './capabilities/capabilities.stub';
import { BellNotificationsService } from './bell/bell-notifications.service';
import { of } from 'rxjs';

/**
 * REVEALED HELP BUBBLES — the layout contract for the shared idiom.
 *
 * Every icon-only control in the shell chrome (background toggle, menubar-mode
 * toggle, profile trigger) is paired with a help bubble: an absolutely positioned
 * box anchored to the control, always in the a11y tree via aria-describedby and
 * revealed visually on hover/focus-within.
 *
 * THE BUG THIS FILE EXISTS FOR: an absolutely positioned box with `width: auto`
 * is shrink-to-fit, and shrink-to-fit is capped by the AVAILABLE width — the
 * containing block's width minus the offsets. Those anchors shrink-wrap a 2.5rem
 * icon button, so `inset-inline-end: 3rem` inside a 40px containing block leaves a
 * NEGATIVE available width; the bubble fell back to its min-content width and
 * painted 32px wide by 657px tall on the live site — one character per line, a
 * column of vertical text. `max-width` cannot rescue that: it caps a width, it
 * cannot raise the available one. `width: max-content` can, and does.
 *
 * The assertions are written against that mechanism rather than one measured
 * number, so they hold for any anchor, any help string and any viewport: a
 * bubble's used width must be min(its max-content width, its own max-width).
 */

@Component({ selector: 'app-background', changeDetection: ChangeDetectionStrategy.Eager, template: '' })
class BackgroundStub {
  readonly paused = signal(false);
  toggle() {}
}

@Component({ selector: 'hug-notification-toast', standalone: true, template: '' })
class NotificationToastStub {}

class BellStub {
  readonly unreadCount$ = of(0);
  startPolling = jasmine.createSpy('startPolling');
  stopPolling = jasmine.createSpy('stopPolling');
}

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

describe('revealed help bubbles — width is content-driven, not anchor-driven', () => {
  const trash: HTMLElement[] = [];

  afterEach(() => {
    while (trash.length) trash.pop()!.remove();
  });

  /**
   * The width this bubble WANTS: the very same node, same classes, measured with
   * the anchor offsets and the max-width lifted. cloneNode keeps the Angular
   * `_ngcontent-*` attribute, so component-scoped rules still reach the probe.
   */
  function maxContentWidth(el: HTMLElement): number {
    const probe = el.cloneNode(true) as HTMLElement;
    probe.removeAttribute('id');
    probe.style.position = 'absolute';
    probe.style.insetInlineStart = '0';
    probe.style.insetInlineEnd = 'auto';
    probe.style.insetBlockStart = '0';
    probe.style.insetBlockEnd = 'auto';
    probe.style.width = 'max-content';
    probe.style.maxWidth = 'none';
    probe.style.opacity = '0';
    document.body.appendChild(probe);
    try {
      return probe.getBoundingClientRect().width;
    } finally {
      probe.remove();
    }
  }

  /** The contract EVERY revealed bubble must satisfy, whatever it is anchored to. */
  function expectSizesToItsContent(bubble: HTMLElement, what: string): void {
    const cs = getComputedStyle(bubble);
    const rect = bubble.getBoundingClientRect();

    expect(cs.position)
      .withContext(`${what} is the absolutely-anchored bubble idiom`)
      .toBe('absolute');

    const cap = parseFloat(cs.maxWidth);
    expect(cap)
      .withContext(`${what} must declare a max-width so long help wraps`)
      .toBeGreaterThan(0);

    // The whole defect in one number: the used width must be decided by the
    // CONTENT (capped by max-width), never by the anchor's available width.
    const wanted = Math.min(maxContentWidth(bubble), cap);
    expect(rect.width)
      .withContext(
        `${what} is only ${Math.round(rect.width)}px wide; its text wants ` +
          `${Math.round(wanted)}px and the anchor must not cap it`,
      )
      .toBeGreaterThanOrEqual(wanted - 1);

    // Plain-language guard on the visible symptom: help reads as a wide, short
    // bubble. 32x657 — one character per line — is the failure it must never be.
    expect(rect.width)
      .withContext(`${what} must paint wider than it is tall, not as a vertical column`)
      .toBeGreaterThan(rect.height);
  }

  /** Bubbles must not go missing from the accessibility tree to get their width. */
  function expectStillDescribesItsControl(bubble: HTMLElement, control: HTMLElement): void {
    expect((control.getAttribute('aria-describedby') ?? '').split(/\s+/))
      .withContext('the icon-only control is described BY the bubble')
      .toContain(bubble.id);
    expect(bubble.textContent!.trim().length)
      .withContext('a description referenced by aria-describedby must carry text')
      .toBeGreaterThan(10);
    // aria-describedby resolves through a `visibility: hidden` target, but not
    // through one that was never laid out: `display: none` would strand it.
    expect(getComputedStyle(bubble).display)
      .withContext('the bubble stays rendered (hidden via visibility, not display)')
      .not.toBe('none');
  }

  /**
   * Anti-regression for the IDIOM rather than for one instance: anything in the
   * shell chrome that is an absolutely positioned `*__help` must be carrying the
   * shared `.help-bubble` class, which is where the sizing lives.
   */
  function expectEveryAbsoluteHelpUsesTheSharedClass(root: HTMLElement, what: string): void {
    const helps = Array.from(root.querySelectorAll<HTMLElement>('[class*="__help"]'));
    expect(helps.length).withContext(`${what} renders at least one help element`).toBeGreaterThan(0);
    for (const h of helps) {
      if (getComputedStyle(h).position !== 'absolute') continue; // in-flow help text
      expect(h.classList.contains('help-bubble'))
        .withContext(
          `${what}: "${h.className}" is an absolutely positioned bubble but does not ` +
            `carry .help-bubble, so nothing gives it width: max-content`,
        )
        .toBeTrue();
    }
  }

  // ── The banner's chrome bubbles (.bg-toggle__help) ─────────────────────────
  // These controls used to be `position: fixed` corner furniture; they now live
  // in the header banner (header-controls.component.*). The bubble contract is
  // unchanged — that is the point of the shared idiom — so the assertions are
  // the same ones, just mounted where the controls actually are.
  describe('header banner chrome', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          NotificationToastService,
          { provide: BellNotificationsService, useValue: new BellStub() },
        ],
      })
        .overrideComponent(AppComponent, {
          remove: { imports: [BackgroundComponent, NotificationToastComponent] },
          add: { imports: [BackgroundStub, NotificationToastStub] },
        })
        .compileComponents();
    });

    function renderShell(): HTMLElement {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('sizes the background-toggle help to its text, not to the 2.5rem button', () => {
      const shell = renderShell();
      const bubble = shell.querySelector('#bg-toggle-help') as HTMLElement;
      expect(bubble).withContext('bg-toggle help must be rendered').toBeTruthy();
      expectSizesToItsContent(bubble, '.bg-toggle__help in .bg-toggle-control');
    });

    it('keeps the background-toggle help as the button description', () => {
      const shell = renderShell();
      const bubble = shell.querySelector('#bg-toggle-help') as HTMLElement;
      const button = shell.querySelector('[data-testid="bg-toggle"]') as HTMLElement;
      expectStillDescribesItsControl(bubble, button);
    });

    it('sizes the same bubble at the menubar-mode anchor one slot above', () => {
      // The menubar-mode control is signed-in only, so re-home the REAL rendered
      // span (its classes therefore cannot drift from the template) under the
      // other anchor and re-measure: same idiom, different offset.
      const shell = renderShell();
      const anchor = document.createElement('div');
      // Same classes the template gives it: `.help-anchor` is what makes the
      // anchor a containing block, and the offsets are component-scoped.
      anchor.className = 'header-controls__item help-anchor menubar-mode-control';
      anchor.innerHTML = '<button type="button" class="bg-toggle"></button>';
      const bubble = (shell.querySelector('#bg-toggle-help') as HTMLElement).cloneNode(
        true,
      ) as HTMLElement;
      bubble.id = 'menubar-mode-help-probe';
      bubble.textContent =
        'Menu bar auto-hides: it appears when announcements or notifications are ' +
        'present. Activate to keep it always shown.';
      anchor.appendChild(bubble);
      document.body.appendChild(anchor);
      trash.push(anchor);

      expectSizesToItsContent(bubble, '.bg-toggle__help in .menubar-mode-control');
    });

    it('leaves no absolutely positioned help in the shell without .help-bubble', () => {
      expectEveryAbsoluteHelpUsesTheSharedClass(renderShell(), 'app shell');
    });
  });

  // ── The profile-trigger bubble (component-scoped .profile-menu__help) ───────
  // The user menu moved out of the menubar and into the header banner (issue #19
  // comment, 2026-08-19), so this suite mounts HeaderControlsComponent. The
  // anchor is still the narrow account-name button, which is the condition the
  // shrink-to-fit bug needs.
  describe('profile trigger', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HeaderControlsComponent],
        providers: [
          provideRouter([]),
          { provide: SessionService, useValue: new SessionStub() },
          { provide: BellNotificationsService, useValue: new BellStub() },
        ],
      }).compileComponents();
    });

    function renderControls(): HTMLElement {
      const fixture = TestBed.createComponent(HeaderControlsComponent);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    /**
     * Re-home the REAL `.profile-menu` subtree (cloneNode keeps every
     * `_ngcontent-*` attribute, so the component-scoped rules still reach it)
     * into a plain wide flex row, so the measurement reproduces the desktop
     * condition the bug lives in — an anchor that shrink-wraps the account-name
     * button — at Karma's narrow context-iframe width too.
     */
    function reanchoredProfileMenu(): { bubble: HTMLElement; trigger: HTMLElement } {
      const real = renderControls().querySelector('.profile-menu') as HTMLElement;
      expect(real).withContext('profile menu must be rendered').toBeTruthy();
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end;width:600px';
      const clone = real.cloneNode(true) as HTMLElement;
      row.appendChild(clone);
      document.body.appendChild(row);
      trash.push(row);
      return {
        bubble: clone.querySelector('#profile-trigger-help') as HTMLElement,
        trigger: clone.querySelector('[data-testid="profile-trigger"]') as HTMLElement,
      };
    }

    it('sizes the help to its text, not to the width of the account-name button', () => {
      const { bubble, trigger } = reanchoredProfileMenu();
      expect(bubble).withContext('profile trigger help must be rendered').toBeTruthy();
      // Guard the premise: the anchor really is narrower than the help wants to be,
      // so this measurement can only pass because the bubble ignores the anchor.
      expect(trigger.getBoundingClientRect().width)
        .withContext('the account-name button is the narrow anchor this bug needs')
        .toBeLessThan(parseFloat(getComputedStyle(bubble).maxWidth));
      expectSizesToItsContent(bubble, '.profile-menu__help');
    });

    it('keeps the help as the trigger description', () => {
      const controls = renderControls();
      expectStillDescribesItsControl(
        controls.querySelector('#profile-trigger-help') as HTMLElement,
        controls.querySelector('[data-testid="profile-trigger"]') as HTMLElement,
      );
    });

    it('leaves no absolutely positioned help in the header controls without .help-bubble', () => {
      expectEveryAbsoluteHelpUsesTheSharedClass(renderControls(), 'header controls');
    });
  });

  // ── What is LEFT in the menubar must still hold the same contract ───────────
  describe('menubar', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [MenuComponent],
        providers: [
          provideRouter([]),
          { provide: SessionService, useValue: new SessionStub() },
          { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
          { provide: BellNotificationsService, useValue: new BellStub() },
        ],
      }).compileComponents();
    });

    it('leaves no absolutely positioned help in the menubar without .help-bubble', () => {
      const fixture = TestBed.createComponent(MenuComponent);
      fixture.detectChanges();
      expectEveryAbsoluteHelpUsesTheSharedClass(fixture.nativeElement as HTMLElement, 'menubar');
    });
  });
});
