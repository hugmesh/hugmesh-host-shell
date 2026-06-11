import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('host should have id="maincontent"', () => {
    expect((fixture.nativeElement as HTMLElement).id).toBe('maincontent');
  });

  it('host should have tabindex="-1" for programmatic focus', () => {
    expect((fixture.nativeElement as HTMLElement).getAttribute('tabindex')).toBe('-1');
  });

  it('should render the "What is Snapdragon?" section heading', () => {
    const headings = Array.from(el.querySelectorAll('h2')).map(h => h.textContent?.trim());
    expect(headings).toContain('What is Snapdragon?');
  });

  it('should render the pronouns section heading', () => {
    const headings = Array.from(el.querySelectorAll('h2')).map(h => h.textContent?.trim());
    expect(headings).toContain('Pronouns?');
  });

  it('should render the links-grid component', () => {
    expect(el.querySelector('[links-grid]')).withContext('links-grid must be present').toBeTruthy();
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

  it('should render .pronouns spans', () => {
    expect(el.querySelectorAll('span.pronouns').length).toBeGreaterThan(0);
  });
});
