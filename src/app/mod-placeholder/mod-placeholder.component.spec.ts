import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ModPlaceholderComponent } from './mod-placeholder.component';

describe('ModPlaceholderComponent', () => {
  let fixture: ComponentFixture<ModPlaceholderComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModPlaceholderComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ModPlaceholderComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('is clearly marked as a TODO placeholder, not a live feature', () => {
    const badge = el.querySelector('[data-testid="mod-todo-badge"]');
    expect(badge?.textContent?.trim()).toBe('TODO');
  });

  it('names the future snapdragon-mod-ui remote it stands in for', () => {
    const remote = el.querySelector('[data-testid="mod-future-remote"]');
    expect(remote?.textContent?.trim()).toBe('snapdragon-mod-ui');
  });

  it('explains that no remote is mounted here', () => {
    const msg = el.querySelector('[data-testid="mod-placeholder-message"]');
    expect(msg?.textContent).toContain('not been');
    expect(msg?.textContent).toContain('placeholder');
  });
});
