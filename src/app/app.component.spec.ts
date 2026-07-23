import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AppComponent } from './app.component';
import { BackgroundComponent } from './background/background.component';
import { NotificationToastComponent } from './notification-toast.component';
import { NotificationToastService } from './notification-toast.service';

@Component({ selector: 'app-background', changeDetection: ChangeDetectionStrategy.Eager,
 template: '' })
class BackgroundStub {
  readonly paused = signal(false);
  toggle() {}
}

@Component({ selector: 'hug-notification-toast', standalone: true, template: '' })
class NotificationToastStub {}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        // The mounted status-gate injects AccountStatusService -> HttpClient. The
        // session is anonymous in this test so it issues NO request (load() is a
        // no-op when signed out), but the HttpClient must still be provided.
        provideHttpClient(),
        provideHttpClientTesting(),
        NotificationToastService,
      ],
    })
      .overrideComponent(AppComponent, {
        remove: { imports: [BackgroundComponent, NotificationToastComponent] },
        add: { imports: [BackgroundStub, NotificationToastStub] },
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

  it('bg-toggle button carries an accessible name and help wired via aria-describedby', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector<HTMLButtonElement>('[data-testid="bg-toggle"]')!;

    // The icon-only control has an accessible NAME (it has no visible text label).
    const label = btn.getAttribute('aria-label');
    expect(label).withContext('bg-toggle needs an aria-label').toBeTruthy();
    expect(label).toContain('background animation');

    // The visible help is PROGRAMMATICALLY ASSOCIATED so it is announced WITH the
    // control, and the describedby target actually exists in the DOM.
    const describedby = btn.getAttribute('aria-describedby');
    expect(describedby).withContext('bg-toggle must reference its help').toBe('bg-toggle-help');
    const help = el.querySelector('#bg-toggle-help');
    expect(help).withContext('bg-toggle help target must exist').toBeTruthy();
    expect(help!.textContent?.trim().length)
      .withContext('bg-toggle help must be genuinely informative, not empty')
      .toBeGreaterThan(10);
    // Dynamic/contextual help announces state changes politely.
    expect(help!.getAttribute('aria-live')).toBe('polite');
  });

  it('skip link should point to #maincontent', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const skip = el.querySelector('a.skip') as HTMLAnchorElement;
    expect(skip?.getAttribute('href')).toBe('#maincontent');
  });
});
