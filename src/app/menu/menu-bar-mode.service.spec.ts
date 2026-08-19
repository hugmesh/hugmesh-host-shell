import {
  MENU_BAR_MODE_KEY,
  MenuBarModeService,
  parseMenuBarMode,
} from './menu-bar-mode.service';

/**
 * The menubar-mode STATE holder (issue #19): 'static' (always shown, the
 * default) vs 'auto' (content-earned + dismissable), persisted per-browser
 * under a 'hug.*' localStorage key following the theme system's client-side
 * pattern (login-ui's 'hug.login.background' background-preset pick).
 * Constructed directly — the service has no Angular dependencies.
 */
describe('MenuBarModeService', () => {
  beforeEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));
  afterEach(() => localStorage.removeItem(MENU_BAR_MODE_KEY));

  it('defaults to static — an un-configured deploy renders exactly as before', () => {
    expect(new MenuBarModeService().mode()).toBe('static');
  });

  it('persists the pick under the canonical hug.shell.menubar key', () => {
    const svc = new MenuBarModeService();
    svc.setMode('auto');
    expect(localStorage.getItem(MENU_BAR_MODE_KEY)).toBe('auto');
  });

  it('a NEW instance (next visit) seeds itself from the persisted pick', () => {
    new MenuBarModeService().setMode('auto');
    expect(new MenuBarModeService().mode()).toBe('auto');
  });

  it('rejects garbage in storage and falls back to static', () => {
    localStorage.setItem(MENU_BAR_MODE_KEY, 'sideways');
    expect(new MenuBarModeService().mode()).toBe('static');
  });

  it('parseMenuBarMode accepts exactly the two modes', () => {
    expect(parseMenuBarMode('static')).toBe('static');
    expect(parseMenuBarMode('auto')).toBe('auto');
    expect(parseMenuBarMode('')).toBeNull();
    expect(parseMenuBarMode(null)).toBeNull();
    expect(parseMenuBarMode(42)).toBeNull();
  });

  it('toggleMode flips static <-> auto and persists each flip', () => {
    const svc = new MenuBarModeService();
    svc.toggleMode();
    expect(svc.mode()).toBe('auto');
    expect(localStorage.getItem(MENU_BAR_MODE_KEY)).toBe('auto');
    svc.toggleMode();
    expect(svc.mode()).toBe('static');
    expect(localStorage.getItem(MENU_BAR_MODE_KEY)).toBe('static');
  });

  it('dismiss() is in-memory only — a dismissal never persists across visits', () => {
    const svc = new MenuBarModeService();
    svc.setMode('auto');
    svc.dismiss();
    expect(svc.dismissed()).toBeTrue();
    expect(localStorage.getItem(MENU_BAR_MODE_KEY))
      .withContext('only the MODE is durable')
      .toBe('auto');
    expect(new MenuBarModeService().dismissed())
      .withContext('a fresh visit starts un-dismissed')
      .toBeFalse();
  });

  it('reveal() ends a standing dismissal (fresh content re-earns the bar)', () => {
    const svc = new MenuBarModeService();
    svc.dismiss();
    svc.reveal();
    expect(svc.dismissed()).toBeFalse();
  });

  it('switching modes clears a standing dismissal — returning to static must SHOW the bar', () => {
    const svc = new MenuBarModeService();
    svc.setMode('auto');
    svc.dismiss();
    svc.setMode('static');
    expect(svc.dismissed()).toBeFalse();
  });
});
