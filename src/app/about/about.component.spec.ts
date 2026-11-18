import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AboutComponent } from './about.component';
import { ChromeThemeService } from '../chrome/chrome-theme.service';

describe('AboutComponent', () => {
  let component: AboutComponent;
  let fixture: ComponentFixture<AboutComponent>;
  let el: HTMLElement;
  let savedTitle: string;

  beforeEach(async () => {
    savedTitle = document.title;
    document.title = 'HugMesh';
    await TestBed.configureTestingModule({
      imports: [AboutComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutComponent);
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

  it("says the theme's own name where it used to say HugMesh", () => {
    document.documentElement.style.setProperty('--sd-header-content', "'Acme'");
    try {
      TestBed.inject(ChromeThemeService).refresh();
      fixture.detectChanges();
      expect(el.textContent).toContain('What is Acme?');
      expect(el.textContent).toContain('Acme is a self-hosted, federated social platform');
      expect(el.textContent).not.toContain('HugMesh');
    } finally {
      document.documentElement.style.removeProperty('--sd-header-content');
      TestBed.inject(ChromeThemeService).refresh();
    }
  });

  it('should render at least one section component', () => {
    expect(el.querySelector('[section]'))
      .withContext('[section] component must be present')
      .toBeTruthy();
  });
});
