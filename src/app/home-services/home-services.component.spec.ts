import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeServicesComponent } from './home-services.component';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';
import { SessionService, SnapSession } from '../session.service';

const SESSION: SnapSession = {
  id: 'google:alice@example.com',
  label: 'alice',
  provider: 'google',
  roles: ['user'],
  bffToken: 't',
  registrationComplete: true,
  matrix: null,
  mastodon: null,
};

// Host wrapper exercises the [home-services] attribute selector.
@Component({
  standalone: true,
  imports: [HomeServicesComponent],
  template: `<div home-services></div>`,
})
class HomeServicesHostComponent {}

describe('HomeServicesComponent — launcher grid', () => {
  let fixture: ComponentFixture<HomeServicesHostComponent>;
  let caps: CapabilitiesStub;
  let session: SessionService;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    caps = new CapabilitiesStub();
    await TestBed.configureTestingModule({
      imports: [HomeServicesHostComponent],
      providers: [
        provideRouter([]),
        { provide: CapabilitiesService, useValue: caps },
      ],
    }).compileComponents();

    session = TestBed.inject(SessionService);
    fixture = TestBed.createComponent(HomeServicesHostComponent);
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => localStorage.clear());

  const cardEl = (id: string) =>
    el.querySelector(`[data-testid="card-${id}"]`) as HTMLElement | null;
  const helpEl = (id: string) =>
    el.querySelector(`[data-testid="card-${id}-help"]`) as HTMLElement | null;

  it('renders the grid as a labelled role=list', () => {
    fixture.detectChanges();
    const grid = el.querySelector('#home-services')!;
    expect(grid.getAttribute('role')).toBe('list');
    expect(grid.getAttribute('aria-label')).toBe('Services');
  });

  it('renders a card per catalog service', () => {
    fixture.detectChanges();
    ['matrix', 'mastodon', 'forum', 'games', 'admin', 'mod'].forEach((id) =>
      expect(cardEl(id)).withContext(id).toBeTruthy(),
    );
  });

  describe('USER-SITUATIONAL — registered user', () => {
    beforeEach(() => {
      session.set(SESSION);
      fixture.detectChanges();
    });

    it('an enabled card is a real <a> link (focusable, routerLink)', () => {
      const matrix = cardEl('matrix')!;
      expect(matrix.tagName.toLowerCase()).toBe('a');
      expect(matrix.getAttribute('data-state')).toBe('enabled');
      expect(matrix.hasAttribute('aria-disabled')).toBeFalse();
      expect(helpEl('matrix')).toBeNull();
    });

    it('a role-gated card the user lacks is disabled with aria-describedby helptext', () => {
      const admin = cardEl('admin')!;
      expect(admin.getAttribute('aria-disabled')).toBe('true');
      expect(admin.getAttribute('data-state')).toBe('role');
      const help = helpEl('admin')!;
      expect(admin.getAttribute('aria-describedby')).toBe(help.id);
      expect(help.textContent).toContain('an administrator');
      // a disabled card is NOT a link.
      expect(admin.tagName.toLowerCase()).not.toBe('a');
    });
  });

  describe('ABSENT optional service -> greyed card', () => {
    it('a NOT-installed service renders aria-disabled with the "not available" reason', () => {
      caps.setAbsent('games');
      session.set(SESSION);
      fixture.detectChanges();

      const games = cardEl('games')!;
      expect(games.getAttribute('aria-disabled')).toBe('true');
      expect(games.getAttribute('data-state')).toBe('absent');
      const help = helpEl('games')!;
      expect(games.getAttribute('aria-describedby')).toBe(help.id);
      expect(help.textContent).toContain('not available on this deployment');
    });
  });

  describe('reactivity', () => {
    it('re-renders a card from greyed to enabled when its install-state flips', () => {
      caps.setAbsent('forum');
      session.set(SESSION);
      fixture.detectChanges();
      expect(cardEl('forum')!.getAttribute('data-state')).toBe('absent');

      caps.installedSlugs.set(new Set(['matrix', 'mastodon', 'forum', 'games']));
      fixture.detectChanges();
      expect(cardEl('forum')!.getAttribute('data-state')).toBe('enabled');
    });
  });
});
