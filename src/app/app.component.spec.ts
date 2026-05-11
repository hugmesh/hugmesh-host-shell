import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { BackgroundComponent } from './background/background.component';

@Component({ selector: 'app-background', template: '' })
class BackgroundStub {
  readonly paused = signal(false);
  toggle() {}
}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    })
      .overrideComponent(AppComponent, {
        remove: { imports: [BackgroundComponent] },
        add: { imports: [BackgroundStub] },
      })
      .compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render a skip link with correct text', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const skip = el.querySelector('a.skip.visually-hidden-focusable');
    expect(skip).withContext('skip link must be present').toBeTruthy();
    expect(skip!.textContent?.trim()).toBe('Skip to main content');
  });

  it('should render a router-outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('router-outlet'))
      .withContext('router-outlet must be present')
      .toBeTruthy();
  });

  it('should render the background toggle button', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('button.bg-toggle');
    expect(btn).withContext('bg-toggle button must be present').toBeTruthy();
    expect(btn!.getAttribute('aria-pressed')).not.toBeNull();
  });

  it('skip link should point to #maincontent', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const skip = el.querySelector('a.skip') as HTMLAnchorElement;
    expect(skip?.getAttribute('href')).toBe('#maincontent');
  });
});
