import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  BackgroundComponent,
  THEME_CHANGE_EVENT,
  VANTA_EFFECT_LOADER,
  VANTA_WEBGL_PROBE,
} from './background.component';
import { BackgroundEffectId } from './background.types';
import { VantaInstance } from './vanta-effects';

/**
 * The theme-declared effect layer (--sd-bg-effect, issue #19) — parsing wired to
 * the DOM, lazy init, destroy-on-switch/navigation, reduced motion, degradation.
 *
 * MIRRORS login-ui's login-background.component.spec.ts test approach: the Vanta
 * loader and the WebGL probe are injection-token seams, so the entire lifecycle is
 * driven without a GPU and without downloading three.js into the karma bundle.
 * The wash/gradient side of this component keeps its own specs
 * (background.component.spec.ts, background.theme.spec.ts).
 */

/**
 * A stand-in for one Vanta effect. Records what it was constructed with and what was
 * pushed at it afterwards, which is how the "theme changes restyle the background
 * LIVE, without a reload" claim is verified without a GPU.
 */
class FakeVanta implements VantaInstance {
  static created: FakeVanta[] = [];
  readonly updates: Array<Record<string, unknown>> = [];
  destroyed = false;

  constructor(readonly options: Record<string, unknown>) {
    FakeVanta.created.push(this);
    // Vanta appends its renderer's canvas to the element it was given; the
    // context-loss watcher looks for exactly that.
    const el = options['el'] as HTMLElement | undefined;
    el?.appendChild(document.createElement('canvas'));
  }

  setOptions(options: Record<string, unknown>): void {
    this.updates.push(options);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

describe('BackgroundComponent theme-declared effect (--sd-bg-effect)', () => {
  let fixture: ComponentFixture<BackgroundComponent>;
  let loaded: BackgroundEffectId[];
  let loader: jasmine.Spy;
  let webgl: jasmine.Spy;

  /** What a theme does: declare its background effect on :root. */
  function setThemeEffect(value: string, token = '--sd-bg-effect'): void {
    document.documentElement.style.setProperty(token, value);
  }

  function clearThemeEffect(): void {
    for (const token of ['--sd-bg-effect', '--hug-bg-effect', '--hug-primary']) {
      document.documentElement.style.removeProperty(token);
    }
  }

  /**
   * Poll until `predicate` holds. Effect switches ride a requestAnimationFrame
   * coalescer plus a dynamic-import microtask, whose timing is the browser's to
   * decide — a fixed sleep would be either flaky or slow, and this is neither.
   */
  async function waitFor(predicate: () => boolean, what: string): Promise<void> {
    for (let i = 0; i < 200 && !predicate(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      fixture.detectChanges();
    }
    expect(predicate()).withContext(`timed out waiting for: ${what}`).toBeTrue();
  }

  /** Mount and let the (async) effect start settle. */
  async function mount(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(BackgroundComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /**
   * Mount a theme that declares a running effect, then wait for it to actually be
   * running: the start path is async OUTSIDE the zone (deliberately — see
   * startEffect()), so whenStable() alone is not a guarantee it has finished.
   */
  async function mountRunning(): Promise<HTMLElement> {
    const host = await mount();
    await waitFor(() => fixture.componentInstance.effectRunning(), 'the effect to start');
    return host;
  }

  beforeEach(() => {
    FakeVanta.created = [];
    loaded = [];
    clearThemeEffect();

    loader = jasmine.createSpy('loadVantaEffect').and.callFake(async (id: BackgroundEffectId) => {
      loaded.push(id);
      return {
        three: { REVISION: 'fake' },
        factory: (options: Record<string, unknown>) => new FakeVanta(options),
      };
    });
    webgl = jasmine.createSpy('webglAvailable').and.returnValue(true);

    TestBed.configureTestingModule({
      imports: [BackgroundComponent],
      providers: [
        { provide: VANTA_EFFECT_LOADER, useValue: loader },
        { provide: VANTA_WEBGL_PROBE, useValue: webgl },
      ],
    });
  });

  afterEach(() => {
    clearThemeEffect();
  });

  // ── the default: the wash, untouched ─────────────────────────────────────────

  it('runs NO effect — and fetches NO chunk — when the theme says nothing', async () => {
    const host = await mount();

    expect(loader).not.toHaveBeenCalled();
    expect(fixture.componentInstance.themeEffect()).toBeNull();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();
    expect(host.classList.contains('is-flat')).toBeFalse();
    expect(host.getAttribute('data-bg-effect')).toBe('gradient');
  });

  it('treats an explicit gradient declaration as the default wash', async () => {
    setThemeEffect('gradient');
    const host = await mount();

    expect(loader).not.toHaveBeenCalled();
    expect(host.classList.contains('is-flat')).toBeFalse();
    expect(host.getAttribute('data-bg-effect')).toBe('gradient');
  });

  // ── none: the wash at rest ────────────────────────────────────────────────────

  it("renders `none` FLAT: the is-flat class stills the wash, and nothing is fetched", async () => {
    setThemeEffect('none');
    const host = await mount();

    expect(loader).not.toHaveBeenCalled();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();
    expect(host.classList.contains('is-flat')).toBeTrue();
    expect(host.getAttribute('data-bg-effect')).toBe('none');
  });

  // ── vanta-*: lazy init ────────────────────────────────────────────────────────

  it('starts the effect the THEME declares via --sd-bg-effect', async () => {
    setThemeEffect('vanta-waves');
    const host = await mountRunning();

    expect(loaded).toEqual(['waves']);
    expect(fixture.componentInstance.effectRunning()).toBeTrue();
    expect(host.classList.contains('has-effect'))
      .withContext('the wash sweep is stilled while the canvas covers it')
      .toBeTrue();
    expect(host.querySelector('[data-testid="background-stage"] canvas'))
      .withContext('the canvas mounts inside the stage')
      .toBeTruthy();
  });

  it('reads the --hug-bg-effect runtime twin when only it is set', async () => {
    // The generator emits every --sd-* token a second time under --hug-*; a
    // hand-written theme may set either half of the pair.
    setThemeEffect('vanta-globe', '--hug-bg-effect');
    await mountRunning();
    expect(loaded).toEqual(['globe']);
  });

  it('degrades an unbundled vanta-<name> declaration to the wash — and pays for zero chunks', async () => {
    setThemeEffect('vanta-birds');
    const host = await mount();

    expect(loader).not.toHaveBeenCalled();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();
    expect(host.classList.contains('is-flat')).toBeFalse();
    expect(host.getAttribute('data-bg-effect')).toBe('gradient');
  });

  // ── accessibility: reduced motion ─────────────────────────────────────────────

  it('NEVER starts an effect — or even fetches one — under prefers-reduced-motion', async () => {
    // An animated full-viewport background is a vestibular trigger, so the
    // requirement is "not started", not "started and dimmed". Fetching the 154 KB
    // (gzipped) three.js chunk would also be pure waste for this visitor.
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    setThemeEffect('vanta-fog');

    await mount();

    expect(loader).not.toHaveBeenCalled();
    expect(FakeVanta.created.length).toBe(0);
    expect(fixture.componentInstance.reducedMotion()).toBeTrue();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();
  });

  // ── degradation ───────────────────────────────────────────────────────────────

  it('does not download the animation when the machine has no WebGL', async () => {
    webgl.and.returnValue(false);
    setThemeEffect('vanta-waves');

    await mount();

    expect(loader).not.toHaveBeenCalled();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();
  });

  it('stays on the themed wash when the effect chunk fails to load', async () => {
    loader.and.returnValue(Promise.reject(new Error('network down')));
    setThemeEffect('vanta-fog');

    const host = await mount();

    expect(fixture.componentInstance.effectRunning()).toBeFalse();
    expect(host.classList.contains('has-effect')).toBeFalse();
  });

  it('stays on the themed wash when Vanta itself throws at init', async () => {
    loader.and.resolveTo({
      three: {},
      factory: () => {
        throw new Error('WebGL context creation failed');
      },
    });
    setThemeEffect('vanta-net');

    await mount();

    expect(fixture.componentInstance.effectRunning()).toBeFalse();
  });

  it('tears the effect down when the GL context is lost', async () => {
    setThemeEffect('vanta-fog');
    const host = await mountRunning();
    expect(fixture.componentInstance.effectRunning()).toBeTrue();

    host.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost'));
    fixture.detectChanges();

    expect(FakeVanta.created[0].destroyed).toBeTrue();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();
  });

  // ── theme reactivity ──────────────────────────────────────────────────────────

  it('opens the effect on the LIVE theme, not on a compiled palette', async () => {
    document.documentElement.style.setProperty('--hug-primary', '#ff0000');
    setThemeEffect('vanta-fog');
    await mountRunning();
    expect(FakeVanta.created[0].options['highlightColor']).toBe(0xff0000);
  });

  it('restyles a RUNNING effect when the theme changes — no reload, no teardown', async () => {
    setThemeEffect('vanta-fog');
    await mountRunning();
    const instance = FakeVanta.created[0];
    expect(instance.updates.length).toBe(0);

    // What a theme switch does: change the tokens, then say so.
    document.documentElement.style.setProperty('--hug-primary', '#00ff00');
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    fixture.detectChanges();

    expect(instance.destroyed).withContext('restyled in place, not rebuilt').toBeFalse();
    expect(instance.updates.length).toBeGreaterThan(0);
    expect(instance.updates[instance.updates.length - 1]['highlightColor']).toBe(0x00ff00);
  });

  it('ignores DOM churn that changed no colour and no declaration', async () => {
    setThemeEffect('vanta-fog');
    await mountRunning();
    const instance = FakeVanta.created[0];

    // Angular injects stylesheets, routers add attributes: the watcher is broad on
    // purpose, so it must decide by VALUE or it would thrash a WebGL effect.
    document.documentElement.setAttribute('data-theme', 'dark');
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    try {
      expect(instance.updates.length).toBe(0);
      expect(instance.destroyed).toBeFalse();
    } finally {
      document.documentElement.removeAttribute('data-theme');
    }
  });

  it('switches effects when the theme changes its declaration — old instance destroyed', async () => {
    setThemeEffect('vanta-net');
    await mountRunning();
    expect(loaded).toEqual(['net']);
    const first = FakeVanta.created[0];

    setThemeEffect('vanta-waves');
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    await waitFor(
      () => fixture.componentInstance.themeEffect() === 'waves' &&
        fixture.componentInstance.effectRunning(),
      'waves to take over',
    );

    // Vanta instances hold a WebGL context; a switch that does not destroy() the
    // old one leaks the context and doubles the render loop.
    expect(first.destroyed).withContext('old instance released').toBeTrue();
    expect(loaded).toEqual(['net', 'waves']);
  });

  it('honours a declaration that only arrives when the theme stylesheet lands late', async () => {
    // snap-theme.css is a <link> that can still be in flight at boot: the shell
    // starts on the wash and must follow the theme when it lands.
    const host = await mount();
    expect(loader).not.toHaveBeenCalled();

    setThemeEffect('vanta-globe');
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    await waitFor(() => fixture.componentInstance.effectRunning(), 'globe to start');

    expect(loaded).toEqual(['globe']);
    expect(host.getAttribute('data-bg-effect')).toBe('globe');
  });

  it('tears the animation down when the theme switches to none — and goes flat', async () => {
    setThemeEffect('vanta-fog');
    const host = await mountRunning();
    expect(fixture.componentInstance.effectRunning()).toBeTrue();

    setThemeEffect('none');
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    await waitFor(() => fixture.componentInstance.themeEffect() === 'none', 'the flat wash');
    fixture.detectChanges();

    expect(FakeVanta.created[0].destroyed).toBeTrue();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();
    expect(host.classList.contains('is-flat')).toBeTrue();
    expect(loaded).withContext('no second chunk fetched').toEqual(['fog']);
  });

  // ── the shell's own pause toggle ──────────────────────────────────────────────

  it('destroys a running effect on pause and restarts it on resume', async () => {
    setThemeEffect('vanta-waves');
    await mountRunning();
    expect(fixture.componentInstance.effectRunning()).toBeTrue();

    fixture.componentInstance.toggle();
    fixture.detectChanges();
    expect(FakeVanta.created[0].destroyed)
      .withContext('pause releases the WebGL context, it does not just hide motion')
      .toBeTrue();
    expect(fixture.componentInstance.effectRunning()).toBeFalse();

    fixture.componentInstance.toggle();
    await waitFor(() => fixture.componentInstance.effectRunning(), 'the effect to restart');
    expect(loaded).toEqual(['waves', 'waves']);
    expect(FakeVanta.created.length).toBe(2);
  });

  // ── lifecycle ─────────────────────────────────────────────────────────────────

  it('releases the effect when the component goes away (navigation/unmount)', async () => {
    setThemeEffect('vanta-fog');
    await mountRunning();
    const instance = FakeVanta.created[0];

    fixture.destroy();

    expect(instance.destroyed).toBeTrue();
  });
});
