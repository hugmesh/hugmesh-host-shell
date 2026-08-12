import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a link to the GitHub source repo', () => {
    const link = el.querySelector<HTMLAnchorElement>(
      'a[href*="github.com/hugmesh"]',
    );
    expect(link).withContext('GitHub source link must be present').toBeTruthy();
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toContain('noopener');
  });

  it('GitHub link must have an accessible label', () => {
    const link = el.querySelector<HTMLAnchorElement>(
      'a[href*="github.com/hugmesh"]',
    );
    const label =
      link?.getAttribute('aria-label') ?? link?.getAttribute('title') ?? '';
    expect(label.length).toBeGreaterThan(0);
  });

  it('should NOT render the stale personal-site CC0 mark', () => {
    // The CC0 license mark (and its icons hotlinked from
    // mirrors.creativecommons.org — broken on air-gapped/self-hosted deploys)
    // was stale personal-website identity for the org host shell; it was removed
    // per the branding baseline. Guard against re-introduction.
    const cc = el.querySelector('a[href*="creativecommons.org"]');
    expect(cc).withContext('CC0 license link must be gone').toBeNull();
    const hotlinked = el.querySelector('img[src*="mirrors.creativecommons.org"]');
    expect(hotlinked).withContext('no externally hotlinked CC icons').toBeNull();
  });

  it('should not render a horizontal rule', () => {
    expect(el.querySelector('hr')).toBeNull();
  });
});
