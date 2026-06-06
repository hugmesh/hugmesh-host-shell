import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinksComponent } from './links.component';

// Host wrapper exercises the [links-grid] attribute selector.
@Component({
  standalone: true,
  imports: [LinksComponent],
  template: `<div links-grid></div>`,
})
class LinksHostComponent {}

describe('LinksComponent', () => {
  let fixture: ComponentFixture<LinksHostComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinksHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LinksHostComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('renders a link to the Snapdragon Systems GitHub org', () => {
    const link = el.querySelector<HTMLAnchorElement>('a[href*="github.com/snapdragon-systems"]');
    expect(link).withContext('GitHub link must be present').toBeTruthy();
  });

  it('opens the external link safely (target=_blank + rel=noopener)', () => {
    const link = el.querySelector<HTMLAnchorElement>('a[href*="github.com"]');
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toContain('noopener');
  });

  it('external link has an accessible name announcing it opens in a new tab (a11y)', () => {
    const link = el.querySelector<HTMLAnchorElement>('a[href*="github.com"]');
    const label = link?.getAttribute('aria-label') ?? '';
    expect(label.length).withContext('link must have an accessible label').toBeGreaterThan(0);
    expect(label.toLowerCase()).toContain('new tab');
  });

  it('decorative svg icon is hidden from assistive tech and not focusable (a11y)', () => {
    const svg = el.querySelector('a svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(svg!.getAttribute('focusable')).toBe('false');
  });
});
