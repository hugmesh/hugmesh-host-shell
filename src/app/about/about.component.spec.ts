import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AboutComponent } from './about.component';

describe('AboutComponent', () => {
  let component: AboutComponent;
  let fixture: ComponentFixture<AboutComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('host does NOT carry the skip target (the shell <main id="maincontent"> owns it)', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.id).not.toBe('maincontent');
    expect(host.getAttribute('tabindex')).toBeNull();
  });

  it('should render at least one section component', () => {
    expect(el.querySelector('[section]'))
      .withContext('[section] component must be present')
      .toBeTruthy();
  });
});
