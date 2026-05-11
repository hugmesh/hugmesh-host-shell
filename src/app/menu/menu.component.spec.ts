import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MenuComponent } from './menu.component';
import { routes } from '../app.routes';

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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a <nav> element', () => {
    expect(el.querySelector('nav')).withContext('<nav> must be present').toBeTruthy();
  });

  it('should render one button per menu item', () => {
    const buttons = el.querySelectorAll('button[role="menuitem"]');
    expect(buttons.length).toBe(component.items.length);
  });

  it('should render an Introduction nav button', () => {
    const labels = Array.from(el.querySelectorAll('button[role="menuitem"]')).map(b => b.textContent?.trim());
    expect(labels.some(l => l?.includes('Introduction'))).toBeTrue();
  });

  it('should render an About nav button', () => {
    const labels = Array.from(el.querySelectorAll('button[role="menuitem"]')).map(b => b.textContent?.trim());
    expect(labels.some(l => l?.includes('About'))).toBeTrue();
  });

  it('disabled items should carry aria-disabled="true"', () => {
    const disabled = el.querySelectorAll('button[aria-disabled="true"]');
    expect(disabled.length).withContext('at least one item should be disabled').toBeGreaterThan(0);
  });

  it('disabled items should have tabindex="-1"', () => {
    el.querySelectorAll<HTMLButtonElement>('button[aria-disabled="true"]').forEach(btn => {
      expect(btn.getAttribute('tabindex')).toBe('-1');
    });
  });

  it('should have role="menubar" on the ul', () => {
    expect(el.querySelector('ul')?.getAttribute('role')).toBe('menubar');
  });

  describe('onMenuKeydown', () => {
    it('ArrowRight calls focus on the next enabled item', () => {
      const enabled = Array.from(
        el.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
      ).filter(b => b.getAttribute('tabindex') !== '-1');

      if (enabled.length < 2) { pending('not enough enabled items'); return; }

      const focusSpy = spyOn(HTMLElement.prototype, 'focus');
      enabled[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(focusSpy).toHaveBeenCalled();
    });
  });
});
