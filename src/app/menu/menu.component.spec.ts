import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MenuComponent } from './menu.component';
import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { CapabilitiesStub } from '../capabilities/capabilities.stub';

/**
 * The UNIVERSAL NAV menubar: Home | Mastodon | Matrix. Home is always enabled;
 * Mastodon/Matrix are enabled only once the session is fully registered (matching
 * the registeredGuard) — so the enabled arrow-key cycle is [0] when unregistered
 * and [0, 1, 2] when registered.
 *
 * These specs assert the WAI-ARIA menubar contract end to end:
 *   - role=menubar on the ul, role=menuitem on each entry,
 *   - true ROVING tabindex (exactly one enabled item is tabindex 0),
 *   - disabled (unregistered) social entries get aria-disabled + tabindex -1,
 *   - the onMenuKeydown keyboard suite (Arrow/Home/End/wrap/skip-disabled),
 *   - unrelated keys (Tab/Enter) are no-ops.
 */
class SessionStub {
  loggedIn = signal(true);
  fullyRegistered = signal(true);
  isAdmin = signal(false);
  isMod = signal(false);
  isSuperadmin = signal(false);
  roles = signal<string[]>([]);
  session = signal<{ label: string } | null>({ label: 'alice' });
  cleared = false;
  hasRole(role: string) { return this.roles().some((r) => r.toLowerCase() === role.toLowerCase()); }
  clear() { this.cleared = true; }
}

describe('MenuComponent — universal nav menubar', () => {
  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;
  let stub: SessionStub;
  let caps: CapabilitiesStub;
  let el: HTMLElement;

  beforeEach(async () => {
    stub = new SessionStub();
    caps = new CapabilitiesStub();
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: stub },
        { provide: CapabilitiesService, useValue: caps },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function navButtons(): HTMLElement[] {
    return component.navButtonRefs.map((ref) => ref.nativeElement);
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a <nav> with a role="menubar" primary list', () => {
    expect(el.querySelector('nav')).toBeTruthy();
    expect(el.querySelector('ul[role="menubar"]')).toBeTruthy();
  });

  it('renders Home | Mastodon | Matrix as the menubar entries', () => {
    const labels = navButtons().map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Home', 'Mastodon', 'Matrix']);
  });

  it('Home links to the role-home authgate at "/"', () => {
    const home = navButtons().find((b) => b.textContent?.trim() === 'Home');
    expect(home?.getAttribute('data-route')).toBe('/');
  });

  it('Mastodon and Matrix link to the social remotes', () => {
    const byLabel = (l: string) => navButtons().find((b) => b.textContent?.trim() === l);
    expect(byLabel('Mastodon')?.getAttribute('data-route')).toBe('/social/mastodon');
    expect(byLabel('Matrix')?.getAttribute('data-route')).toBe('/social/matrix');
  });

  describe('roving tabindex (WAI-ARIA menubar)', () => {
    it('makes exactly ONE enabled entry a tab stop (tabindex 0)', () => {
      const tabbable = navButtons().filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabbable.length).toBe(1);
    });

    it('the lone tab stop is Home (activeIndex 0)', () => {
      expect(component.activeIndex).toBe(0);
      expect(navButtons()[0].getAttribute('tabindex')).toBe('0');
    });

    it('non-active enabled entries are tabindex -1 (arrow-reachable only)', () => {
      const mastodon = navButtons().find((b) => b.textContent?.trim() === 'Mastodon');
      expect(mastodon?.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('registration-gated social entries', () => {
    it('disables Mastodon/Matrix when the session is not fully registered', () => {
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      const mastodon = navButtons().find((b) => b.textContent?.trim() === 'Mastodon')!;
      expect(mastodon.hasAttribute('disabled')).toBeTrue();
      expect(mastodon.getAttribute('aria-disabled')).toBe('true');
      expect(mastodon.getAttribute('tabindex')).toBe('-1');
    });

    it('a disabled social entry carries no routerLink', () => {
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      const matrix = navButtons().find((b) => b.textContent?.trim() === 'Matrix');
      expect(matrix?.getAttribute('routerlink')).toBeNull();
    });

    it('enables Mastodon/Matrix once fully registered', () => {
      stub.fullyRegistered.set(true);
      fixture.detectChanges();
      const matrix = navButtons().find((b) => b.textContent?.trim() === 'Matrix')!;
      expect(matrix.hasAttribute('disabled')).toBeFalse();
    });
  });

  describe('install-state gated social entries (federation capabilities)', () => {
    const byLabel = (l: string) => navButtons().find((b) => b.textContent?.trim() === l)!;
    const help = (testid: string) =>
      el.querySelector(`[data-testid="${testid}-help"]`) as HTMLElement | null;

    beforeEach(() => {
      // Registered, so the ONLY remaining gate is install-state.
      stub.fullyRegistered.set(true);
    });

    it('USER-SITUATIONAL: an ABSENT (uninstalled) service is greyed with "not available" helptext', () => {
      caps.setAbsent('matrix');
      fixture.detectChanges();
      const matrix = byLabel('Matrix');
      expect(matrix.hasAttribute('disabled')).toBeTrue();
      expect(matrix.getAttribute('aria-disabled')).toBe('true');
      const reason = help('nav-matrix');
      expect(reason?.textContent).toContain('not available on this deployment');
      expect(matrix.getAttribute('aria-describedby')).toBe('nav-matrix-help');
    });

    it('an installed-but-unregistered service is greyed with a REGISTRATION reason (not install)', () => {
      stub.fullyRegistered.set(false); // installed by default, but not registered
      fixture.detectChanges();
      const mastodon = byLabel('Mastodon');
      expect(mastodon.hasAttribute('disabled')).toBeTrue();
      expect(help('nav-mastodon')?.textContent).toContain('registration');
    });

    it('install-state takes precedence over registration in the reason', () => {
      caps.setAbsent('mastodon');
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      // Both gates fail, but absence is the dominant (unrecoverable) reason.
      expect(help('nav-mastodon')?.textContent).toContain('not available on this deployment');
    });

    it('an installed + registered service is enabled (real <a>, no helptext)', () => {
      caps.installedSlugs.set(new Set(['matrix', 'mastodon']));
      fixture.detectChanges();
      const matrix = byLabel('Matrix');
      expect(matrix.hasAttribute('disabled')).toBeFalse();
      expect(help('nav-matrix')).toBeNull();
    });

    it('the arrow-key cycle skips an absent (uninstalled) service', () => {
      caps.setAbsent('mastodon'); // matrix still installed
      fixture.detectChanges();
      component.activeIndex = 0;
      component.onMenuKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      // index 1 (Mastodon) is absent/disabled -> skipped to index 2 (Matrix).
      expect(component.activeIndex).toBe(2);
    });
  });

  describe('mobile navbar toggler', () => {
    it('has an aria-label for the responsive collapse control', () => {
      const toggler = el.querySelector('.navbar-toggler');
      expect(toggler?.getAttribute('aria-label')).toBe('Toggle navigation');
    });
  });

  describe('profile menu help text (sighted + low/no-sight)', () => {
    const trigger = () =>
      el.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!;

    it('the account-menu trigger has an accessible name describing its PURPOSE', () => {
      const label = trigger().getAttribute('aria-label');
      expect(label).withContext('trigger needs an aria-label').toBeTruthy();
      expect(label).toContain('Account menu');
      // The visible name (alice) is folded into the accessible name.
      expect(label).toContain('alice');
    });

    it('announces a NON-ASCII display name via the accessibleName ASCII util', () => {
      // accessibleName falls back to the display name when no screen-reader name is
      // set; here we simply prove the computed wires the session label through it.
      stub.session.set({ label: '山田太郎' });
      fixture.detectChanges();
      expect(trigger().getAttribute('aria-label')).toBe('Account menu for 山田太郎');
    });

    it('the trigger has VISIBLE help wired via aria-describedby to an existing target', () => {
      const describedby = trigger().getAttribute('aria-describedby');
      expect(describedby).toBe('profile-trigger-help');
      const help = el.querySelector('#profile-trigger-help');
      expect(help).withContext('describedby target must exist').toBeTruthy();
      expect(help!.textContent?.trim().length).toBeGreaterThan(10);
    });

    it('every open dropdown item has describedby help that EXISTS and is informative', () => {
      stub.isAdmin.set(true);
      stub.isMod.set(true);
      fixture.detectChanges();
      component.toggleProfile();
      fixture.detectChanges();

      const items = Array.from(
        el.querySelectorAll<HTMLElement>('.profile-menu__item'),
      );
      // Profile, Admin, API docs, Moderation, Wiki (admin reaches it), Sign out.
      expect(items.length).withContext('admin+mod sees all 6 items').toBe(6);
      for (const item of items) {
        const id = item.getAttribute('aria-describedby');
        expect(id).withContext(`${item.textContent} needs describedby`).toBeTruthy();
        const help = el.querySelector(`#${id}`);
        expect(help).withContext(`help target ${id} must exist`).toBeTruthy();
        expect(help!.textContent?.trim().length)
          .withContext(`help for ${item.textContent} must be informative`)
          .toBeGreaterThan(10);
      }
    });
  });

  describe('profile dropdown — WAI-ARIA menu keyboard operability', () => {
    const trigger = () =>
      el.querySelector<HTMLElement>('[data-testid="profile-trigger"]')!;
    const items = () =>
      Array.from(el.querySelectorAll<HTMLElement>('.profile-menu__item'));
    const triggerKey = (key: string) =>
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const menuKey = (key: string) => {
      const list = el.querySelector<HTMLElement>('#profile-menu-list')!;
      list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };

    beforeEach(() => {
      // Anonymous-by-default + admin/mod off => only Profile + Sign out visible (2).
      stub.isAdmin.set(false);
      stub.isMod.set(false);
      fixture.detectChanges();
    });

    it('opens closed (no item is a tab stop while closed)', () => {
      expect(component.profileOpen()).toBeFalse();
      expect(component.profileActiveIndex()).toBe(-1);
    });

    it('ArrowDown on the trigger opens the menu and lands the cursor on the FIRST item', () => {
      triggerKey('ArrowDown');
      fixture.detectChanges();
      expect(component.profileOpen()).toBeTrue();
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('ArrowUp on the trigger opens the menu and lands the cursor on the LAST item', () => {
      triggerKey('ArrowUp');
      fixture.detectChanges();
      expect(component.profileOpen()).toBeTrue();
      expect(component.profileActiveIndex()).toBe(component.visibleProfileItems().length - 1);
    });

    it('Enter/Space (native click) opens the menu with the cursor on the first item', () => {
      component.toggleProfile();
      fixture.detectChanges();
      expect(component.profileOpen()).toBeTrue();
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('exactly ONE menu item is a tab stop (tabindex 0) while open — true roving tabindex', () => {
      component.toggleProfile();
      fixture.detectChanges();
      const tabbable = items().filter((b) => b.getAttribute('tabindex') === '0');
      expect(tabbable.length).toBe(1);
      expect(items()[0].getAttribute('tabindex')).toBe('0');
      expect(items()[1].getAttribute('tabindex')).toBe('-1');
    });

    it('ArrowDown in the open menu advances the roving cursor and wraps at the end', () => {
      component.toggleProfile(); // cursor at 0
      fixture.detectChanges();
      const last = component.visibleProfileItems().length - 1;
      menuKey('ArrowDown');
      expect(component.profileActiveIndex()).toBe(1);
      // Walk to the last item, then wrap to the first.
      component.profileActiveIndex.set(last);
      menuKey('ArrowDown');
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('ArrowUp in the open menu retreats and wraps from the first to the last', () => {
      component.toggleProfile(); // cursor at 0
      fixture.detectChanges();
      menuKey('ArrowUp');
      expect(component.profileActiveIndex()).toBe(component.visibleProfileItems().length - 1);
    });

    it('Home/End jump the roving cursor to the first/last item', () => {
      component.toggleProfile();
      fixture.detectChanges();
      menuKey('End');
      expect(component.profileActiveIndex()).toBe(component.visibleProfileItems().length - 1);
      menuKey('Home');
      expect(component.profileActiveIndex()).toBe(0);
    });

    it('moves DOM focus to the newly-active item as the cursor moves', () => {
      component.toggleProfile();
      fixture.detectChanges();
      const focusSpy = spyOn(component.profileItemRefs.get(1)!.nativeElement, 'focus');
      menuKey('ArrowDown');
      expect(focusSpy).toHaveBeenCalled();
    });

    it('Escape from the open menu closes it AND restores focus to the trigger', () => {
      component.toggleProfile();
      fixture.detectChanges();
      const focusSpy = spyOn(component.profileTriggerRef!.nativeElement, 'focus');
      const list = el.querySelector<HTMLElement>('#profile-menu-list')!;
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(component.profileOpen()).toBeFalse();
      expect(component.profileActiveIndex()).toBe(-1);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('activating an item with click closes the menu and clears the roving cursor', () => {
      component.toggleProfile();
      fixture.detectChanges();
      items()[0].click();
      fixture.detectChanges();
      expect(component.profileOpen()).toBeFalse();
      expect(component.profileActiveIndex()).toBe(-1);
    });
  });

  describe('onMenuKeydown — keyboard navigation', () => {
    function press(key: string): void {
      component.onMenuKeydown(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    beforeEach(() => {
      // Registered => enabled cycle is [0, 1, 2].
      stub.fullyRegistered.set(true);
      fixture.detectChanges();
      component.activeIndex = 0;
    });

    it('ArrowRight advances to the next enabled entry', () => {
      press('ArrowRight');
      expect(component.activeIndex).toBe(1);
    });

    it('ArrowLeft from the first entry wraps to the last', () => {
      press('ArrowLeft');
      expect(component.activeIndex).toBe(2);
    });

    it('ArrowRight from the last entry wraps back to the first', () => {
      component.activeIndex = 2;
      press('ArrowRight');
      expect(component.activeIndex).toBe(0);
    });

    it('Home jumps to the first entry, End to the last', () => {
      component.activeIndex = 2;
      press('Home');
      expect(component.activeIndex).toBe(0);
      press('End');
      expect(component.activeIndex).toBe(2);
    });

    it('skips disabled social entries when unregistered (cycle = [0])', () => {
      stub.fullyRegistered.set(false);
      fixture.detectChanges();
      component.activeIndex = 0;
      press('ArrowRight');
      expect(component.activeIndex).withContext('stays on Home, the only enabled entry').toBe(0);
    });

    it('moves DOM focus to the newly-active entry', () => {
      const focusSpy = spyOn(component.navButtonRefs.get(1)!.nativeElement, 'focus');
      press('ArrowRight');
      expect(focusSpy).toHaveBeenCalled();
    });

    it('Tab and Enter do not change activeIndex', () => {
      component.activeIndex = 1;
      press('Tab');
      press('Enter');
      expect(component.activeIndex).toBe(1);
    });
  });
});
