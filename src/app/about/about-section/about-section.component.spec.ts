import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AboutSectionComponent } from './about-section.component';

// Host wrapper exercises the [section] attribute selector + content projection.
@Component({
  standalone: true,
  imports: [AboutSectionComponent],
  template: `
    <div section>
      <span question>What is this?</span>
      <p content>Projected body text.</p>
    </div>
  `,
})
class AboutSectionHostComponent {}

describe('AboutSectionComponent', () => {
  let fixture: ComponentFixture<AboutSectionHostComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutSectionHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutSectionHostComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('renders the projected question inside a semantic <h2> heading (a11y landmark)', () => {
    const h2 = host.querySelector('h2');
    expect(h2).withContext('section must expose a heading for screen-reader navigation').toBeTruthy();
    expect(h2!.textContent).toContain('What is this?');
  });

  it('projects the [content] slot into the body region', () => {
    const content = host.querySelector('.content');
    expect(content).toBeTruthy();
    expect(content!.textContent).toContain('Projected body text.');
  });

  it('does not put non-interactive section content into the tab order', () => {
    expect(host.querySelectorAll('[tabindex]').length).toBe(0);
  });
});
