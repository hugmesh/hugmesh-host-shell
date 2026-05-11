import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render an h1 with the site name', () => {
    const h1 = el.querySelector('h1');
    expect(h1).withContext('h1 must be present').toBeTruthy();
    expect(h1!.textContent?.trim()).toBe('Snapdragon Systems');
  });

  it('h1 should have tabindex="-1" for programmatic focus', () => {
    const h1 = el.querySelector<HTMLHeadingElement>('h1');
    expect(h1?.getAttribute('tabindex')).toBe('-1');
  });

  it('host should carry the text-center class', () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).toContain('text-center');
  });
});
