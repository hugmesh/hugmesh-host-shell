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

  it('host should have id="maincontent"', () => {
    expect((fixture.nativeElement as HTMLElement).id).toBe('maincontent');
  });

  it('host should have tabindex="-1" for programmatic focus', () => {
    expect(
      (fixture.nativeElement as HTMLElement).getAttribute('tabindex'),
    ).toBe('-1');
  });

  it('should render at least one section component', () => {
    expect(el.querySelector('[section]'))
      .withContext('[section] component must be present')
      .toBeTruthy();
  });
});
