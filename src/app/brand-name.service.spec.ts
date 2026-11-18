import { TestBed } from '@angular/core/testing';

import { BrandNameService } from './brand-name.service';
import { ChromeThemeService } from './chrome/chrome-theme.service';

/**
 * The name a deploy calls itself: the theme's wordmark, else the served <title>, else
 * "HugMesh". A domain with its own look (served by Host on the local Docker mesh) says its
 * own name in the title, the home page and the about page.
 */
describe('BrandNameService', () => {
  let saved: string;

  const setWordmark = (value: string | null) => {
    const root = document.documentElement.style;
    if (value === null) root.removeProperty('--sd-header-content');
    else root.setProperty('--sd-header-content', value);
    TestBed.inject(ChromeThemeService).refresh();
  };

  beforeEach(() => {
    saved = document.title;
    setWordmark(null);
  });

  afterEach(() => {
    document.title = saved;
    document.documentElement.style.removeProperty('--sd-header-content');
  });

  it('is "HugMesh" when the page has no title and no theme says otherwise', () => {
    document.title = '';
    expect(TestBed.inject(BrandNameService).name()).toBe('HugMesh');
  });

  it('is the title the server delivered when the theme says nothing (a rebranded image)', () => {
    document.title = 'ExampleMesh';
    expect(TestBed.inject(BrandNameService).name()).toBe('ExampleMesh');
  });

  it("is the theme's wordmark when it sets one, over the served title", () => {
    document.title = 'ExampleMesh';
    const brand = TestBed.inject(BrandNameService);
    setWordmark("'Acme'");
    expect(brand.name()).toBe('Acme');
  });

  it('follows a theme that arrives after bootstrap, and back when it goes', () => {
    document.title = 'ExampleMesh';
    const brand = TestBed.inject(BrandNameService);
    expect(brand.name()).toBe('ExampleMesh');
    setWordmark("'Late Wordmark'");
    expect(brand.name()).toBe('Late Wordmark');
    setWordmark(null);
    expect(brand.name()).toBe('ExampleMesh');
  });

  it('never returns an empty name: a blank wordmark falls back', () => {
    document.title = 'ExampleMesh';
    const brand = TestBed.inject(BrandNameService);
    setWordmark("'   '");
    expect(brand.name()).toBe('ExampleMesh');
  });
});
