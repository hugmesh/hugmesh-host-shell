import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { ChromeThemeService } from '../chrome/chrome-theme.service';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let el: HTMLElement;
  let savedTitle: string;

  beforeEach(async () => {
    // The brand is the page as the server delivered it: another spec may have left its own
    // title behind, so this one states the page it renders on.
    savedTitle = document.title;
    document.title = 'HugMesh';
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: CapabilitiesService, useValue: new CapabilitiesStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    document.title = savedTitle;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('host does NOT carry the skip target (the shell <main id="maincontent"> owns it)', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.id).not.toBe('maincontent');
    expect(host.getAttribute('tabindex')).toBeNull();
  });

  it('should render the "What is HugMesh?" section heading', () => {
    const headings = Array.from(el.querySelectorAll('h2')).map(h => h.textContent?.trim());
    expect(headings).toContain('What is HugMesh?');
  });

  it("says the theme's own name where it used to say HugMesh (a domain with its own look)", () => {
    document.documentElement.style.setProperty('--sd-header-content', "'Acme'");
    try {
      TestBed.inject(ChromeThemeService).refresh();
      fixture.detectChanges();
      const headings = Array.from(el.querySelectorAll('h2')).map(h => h.textContent?.trim());
      expect(headings).toContain('What is Acme?');
      expect(el.textContent).toContain('Acme is a self-hosted, federated social platform');
      expect(el.textContent).not.toContain('What is HugMesh?');
    } finally {
      document.documentElement.style.removeProperty('--sd-header-content');
      TestBed.inject(ChromeThemeService).refresh();
    }
  });

  it('should render the "One account, every service" platform section heading', () => {
    const headings = Array.from(el.querySelectorAll('h2')).map(h => h.textContent?.trim());
    expect(headings).toContain('One account, every service');
  });

  it('should render the links-grid component', () => {
    expect(el.querySelector('[links-grid]')).withContext('links-grid must be present').toBeTruthy();
  });

  it('should render the home-services launcher grid', () => {
    expect(el.querySelector('[home-services]'))
      .withContext('home-services launcher grid must be present')
      .toBeTruthy();
  });

  it('mounts the home-announcements banner above the home content', () => {
    const banner = el.querySelector('[home-announcements]');
    expect(banner).withContext('home-announcements mount point must be present').toBeTruthy();
    // The banner must sit ABOVE the first home section in document order.
    const firstSection = el.querySelector('.home-section');
    expect(banner!.compareDocumentPosition(firstSection!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .withContext('the announcements banner precedes the home content')
      .toBeTruthy();
  });

  it('paragraphs must not have tabindex (non-interactive elements must not be in tab order)', () => {
    expect(el.querySelectorAll('p[tabindex]').length).toBe(0);
  });

  it('must NOT re-introduce the personal-site pronouns fill-in copy', () => {
    // The public /home page used to carry personal-website leftover copy (a
    // "Pronouns?" section with a fill-in instruction to system members). It was
    // replaced with factual platform copy per the branding baseline; guard so it
    // cannot creep back into this org host shell.
    expect(el.querySelectorAll('span.pronouns').length).toBe(0);
    expect((el.textContent ?? '').toLowerCase()).not.toContain('pronoun');
  });
});
