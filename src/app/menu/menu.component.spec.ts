import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MenuComponent } from './menu.component';
import { routes } from '../app.routes';

/**
 * MENU_ITEMS (declared order): 0 Introduction (enabled), 1 Projects (disabled),
 * 2 About (enabled). So the enabled cycle the arrow keys walk is [0, 2] and the
 * disabled item at index 1 is never a tab stop nor an arrow target.
 *
 * These specs assert the WAI-ARIA menubar contract end to end:
 *   - role=menubar on the ul, role=menuitem on each button,
 *   - true ROVING tabindex (exactly one enabled item is tabindex 0),
 *   - disabled item gets aria-disabled=true + tabindex=-1 + the disabled attr,
 *   - the full onMenuKeydown keyboard suite (Arrow/Home/End/wrap/skip-disabled),
 *   - unrelated keys (Tab/Enter) are no-ops.
 */
describe('MenuComponent', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function navButtons(): HTMLButtonElement[] {
    return component.navButtonRefs.map((ref) => ref.nativeElement);
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a <nav> element', () => {
    expect(el.querySelector('nav')).withContext('<nav> must be present').toBeTruthy();
  });

  it('should render one menuitem button per menu item', () => {
    const buttons = el.querySelectorAll('button[role="menuitem"]');
    expect(buttons.length).toBe(component.items.length);
  });

  it('should put role="menubar" on the primary ul', () => {
    expect(el.querySelector('ul')?.getAttribute('role')).toBe('menubar');
  });

  it('should render an Introduction nav button pointing at home', () => {
    const intro = navButtons().find((b) => b.textContent?.trim() === 'Introduction');
    expect(intro).toBeTruthy();
    expect(intro?.getAttribute('data-route'))
      .withContext('Introduction links to home')
      .toBe('home');
  });

  it('should render an About nav button', () => {
    const labels = navButtons().map((b) => b.textContent?.trim());
    expect(labels).toContain('About');
  });

  describe('roving tabindex (WAI-ARIA menubar)', () => {
    it('makes exactly ONE enabled item a tab stop (tabindex 0)', () => {
      const tabbable = navButtons().filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabbable.length).withContext('exactly one tab stop in the menubar').toBe(1);
    });

    it('the lone tab stop is the active item (Introduction at activeIndex 0)', () => {
      expect(component.activeIndex).toBe(0);
      expect(navButtons()[0].getAttribute('tabindex')).toBe('0');
    });

    it('non-active enabled items are tabindex -1 (arrow-reachable only)', () => {
      const about = navButtons().find((b) => b.textContent?.trim() === 'About');
      expect(about?.getAttribute('tabindex')).toBe('-1');
    });

    it('renders the lone tab stop on whichever item activeIndex points at', () => {
      // Re-create with the cursor already on About, so the first CD pass renders
      // the moved tab stop without a mid-cycle mutation (which would trip the
      // dev-mode ExpressionChanged double-check — a test artifact, not a bug).
      const fresh = TestBed.createComponent(MenuComponent);
      fresh.componentInstance.activeIndex = 2;
      fresh.detectChanges();
      const buttons = fresh.componentInstance.navButtonRefs.map((r) => r.nativeElement);
      const tabbable = buttons.filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabbable.length).toBe(1);
      expect(tabbable[0].textContent?.trim()).toBe('About');
    });
  });

  describe('disabled item a11y', () => {
    it('the Projects item is disabled with aria-disabled=true + tabindex=-1', () => {
      const projects = navButtons().find((b) => b.textContent?.trim() === 'Projects');
      expect(projects).toBeTruthy();
      expect(projects?.hasAttribute('disabled')).toBeTrue();
      expect(projects?.getAttribute('aria-disabled')).toBe('true');
      expect(projects?.getAttribute('tabindex')).toBe('-1');
      expect(projects?.classList.contains('disabled')).toBeTrue();
    });

    it('a disabled item carries no routerLink', () => {
      const projects = navButtons().find((b) => b.textContent?.trim() === 'Projects');
      expect(projects?.getAttribute('routerlink')).toBeNull();
    });
  });

  describe('mobile navbar toggler', () => {
    it('has an aria-label for the responsive collapse control', () => {
      const toggler = el.querySelector('.navbar-toggler');
      expect(toggler).toBeTruthy();
      expect(toggler?.getAttribute('aria-label')).toBe('Toggle navigation');
    });
  });

  describe('onMenuKeydown — keyboard navigation (enabled cycle = [0, 2])', () => {
    function press(key: string): void {
      component.onMenuKeydown(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    beforeEach(() => {
      component.activeIndex = 0;
    });

    it('ArrowRight advances to the next enabled item, skipping the disabled one', () => {
      press('ArrowRight');
      expect(component.activeIndex).toBe(2);
    });

    it('ArrowDown advances to the next enabled item', () => {
      press('ArrowDown');
      expect(component.activeIndex).toBe(2);
    });

    it('ArrowLeft from the first item wraps to the last enabled item', () => {
      press('ArrowLeft');
      expect(component.activeIndex).toBe(2);
    });

    it('ArrowUp from the first item wraps to the last enabled item', () => {
      press('ArrowUp');
      expect(component.activeIndex).toBe(2);
    });

    it('ArrowRight from the last enabled item wraps back to the first', () => {
      component.activeIndex = 2;
      press('ArrowRight');
      expect(component.activeIndex).toBe(0);
    });

    it('ArrowLeft from the last enabled item skips the disabled one back to first', () => {
      component.activeIndex = 2;
      press('ArrowLeft');
      expect(component.activeIndex).toBe(0);
    });

    it('Home jumps to the first enabled item', () => {
      component.activeIndex = 2;
      press('Home');
      expect(component.activeIndex).toBe(0);
    });

    it('End jumps to the last enabled item', () => {
      press('End');
      expect(component.activeIndex).toBe(2);
    });

    it('moves DOM focus to the newly-active item', () => {
      const focusSpy = spyOn(component.navButtonRefs.get(2)!.nativeElement, 'focus');
      press('ArrowRight');
      expect(focusSpy).toHaveBeenCalled();
    });

    it('Tab does not change activeIndex (native tab order preserved)', () => {
      component.activeIndex = 2;
      press('Tab');
      expect(component.activeIndex).toBe(2);
    });

    it('Enter does not change activeIndex', () => {
      component.activeIndex = 2;
      press('Enter');
      expect(component.activeIndex).toBe(2);
    });
  });
});
