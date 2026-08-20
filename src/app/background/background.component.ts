import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  BackgroundEffectId,
  THEME_EFFECT_TOKENS,
  ThemeBackgroundEffect,
  isBackgroundEffect,
  parseThemeBackgroundEffect,
  vantaOptionsFor,
} from './background.types';
import {
  ThemePalette,
  paletteFingerprint,
  readThemePalette,
} from './theme-tokens';
import {
  VantaEffectLoader,
  VantaInstance,
  loadVantaEffect,
  webglAvailable,
} from './vanta-effects';

/**
 * The Vanta loader, behind a token so a spec can drive the whole lifecycle without a
 * GPU (and without downloading three.js into the karma bundle). Same seam as
 * login-ui's VANTA_EFFECT_LOADER.
 */
export const VANTA_EFFECT_LOADER = new InjectionToken<VantaEffectLoader>(
  'VANTA_EFFECT_LOADER',
  { providedIn: 'root', factory: () => loadVantaEffect },
);

/** The WebGL capability probe, behind a token for the same reason. */
export const VANTA_WEBGL_PROBE = new InjectionToken<() => boolean>('VANTA_WEBGL_PROBE', {
  providedIn: 'root',
  factory: () => webglAvailable,
});

/**
 * Event a future in-page theme switcher can dispatch on `window` to tell the
 * background its tokens moved. The SAME event name login-ui listens for, so one
 * switcher notifies every consumer of the theme contract at once.
 *
 * The background already watches the DOM for theme changes, which covers every
 * mechanism that mutates `:root` or swaps a stylesheet. This event exists for the one
 * case observation cannot see: a switcher that changes tokens inside a constructed
 * stylesheet or a CSSOM rule, where no node and no attribute changes.
 */
export const THEME_CHANGE_EVENT = 'hug-theme-change';

/**
 * The shell's decorative backdrop: the theme-driven gradient wash (pure CSS, see
 * background.component.scss) plus — new with the `--sd-bg-effect` contract — an
 * optional theme-declared Vanta/three.js effect layer.
 *
 * The EFFECT lifecycle mirrors hugmesh-login-ui's LoginBackgroundComponent (merged
 * login-ui PR #6) deliberately, so the two consumers of `--sd-bg-effect` cannot
 * drift: same tolerant parse, same lazy chunk loading, same staleness token, same
 * destroy-before-switch, same reduced-motion and WebGL guards, same live recolour
 * through setOptions(). What this shell does NOT mirror is login-ui's env override,
 * visitor picker and operator image — none of those exist here; the THEME alone
 * governs this layer (`gradient` default | `none` flat | `vanta-<name>`).
 *
 * DEGRADATION IS THE DESIGN: the CSS wash is painted before any of this class runs,
 * and EVERY path that could fail — no WebGL, a chunk that will not load, a Vanta
 * init that throws, a lost GL context, an unknown effect id — lands back on it.
 * There is no state in which the shell's backdrop is blank.
 *
 * A11y: the layer is decorative and non-interactive (see the template comment), and
 * `prefers-reduced-motion: reduce` means the effect is NEVER STARTED — not started
 * and paused — so the animation chunks (154 KB gzipped of three.js, plus the
 * effect) are not even fetched. The shell's own pause toggle (`paused()`) gets the
 * same respect: pausing destroys a running effect, resuming restarts it.
 */
@Component({
  selector: 'app-background',
  templateUrl: './background.component.html',
  styleUrl: './background.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '[class.is-paused]': 'paused()',
    '[class.is-flat]': 'flat()',
    '[class.has-effect]': 'effectRunning()',
    '[attr.data-bg-effect]': 'themeEffect() ?? "gradient"',
  },
})
export class BackgroundComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly loadEffect = inject(VANTA_EFFECT_LOADER);
  private readonly hasWebgl = inject(VANTA_WEBGL_PROBE);

  /** Mount point for a Vanta effect's canvas; empty (and invisible) otherwise. */
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  /** The shell's own pause toggle (driven by the app chrome's bg-toggle button). */
  readonly paused = signal(false);
  /** The live theme, re-read whenever anything could have changed it. */
  readonly palette = signal<ThemePalette>(readThemePalette());
  /** The theme's parsed `--sd-bg-effect` declaration (null: the theme said nothing). */
  readonly themeEffect = signal<ThemeBackgroundEffect | null>(null);
  /** True while the visitor has asked for reduced motion. */
  readonly reducedMotion = signal(false);
  /** True once an effect is running; drives the has-effect class, specs assert on it. */
  readonly effectRunning = signal(false);
  /** `--sd-bg-effect: none` — the wash at rest: same colours, zero motion. */
  readonly flat = computed(() => this.themeEffect() === 'none');

  private instance: VantaInstance | null = null;
  private instanceEffect: BackgroundEffectId | null = null;
  /** Monotonic token so a slow lazy import cannot revive an effect already switched away from. */
  private startToken = 0;
  private observers: MutationObserver[] = [];
  private teardown: Array<() => void> = [];
  private paletteFrame = 0;
  private viewReady = false;

  constructor() {
    // A theme change restyles a RUNNING effect in place: all four shipped effects
    // re-read their colour options every frame, so pushing the new palette through
    // setOptions() is a live recolour with no teardown, no context loss and no
    // reload. Guarded on instanceEffect so a palette update that arrives mid-switch
    // cannot push fog's options into waves.
    effect(() => {
      const palette = this.palette();
      const running = this.instance;
      const id = this.instanceEffect;
      if (!running || !id || id !== this.themeEffect()) return;
      try {
        running.setOptions?.(vantaOptionsFor(id, palette));
      } catch {
        // A failed recolour leaves the previous frame on screen, which is strictly
        // better than tearing the background down mid-session.
      }
    });
  }

  ngOnInit(): void {
    this.themeEffect.set(this.themeEffectToken());
    this.watchReducedMotion();
    this.watchTheme();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.applyEffect();
  }

  ngOnDestroy(): void {
    this.stopEffect();
    for (const off of this.teardown) off();
    this.teardown = [];
    for (const observer of this.observers) observer.disconnect();
    this.observers = [];
    if (this.paletteFrame) cancelAnimationFrame(this.paletteFrame);
  }

  /**
   * The chrome's pause toggle. For the CSS wash, pausing is the is-paused class
   * (animation-play-state, handled entirely in the stylesheet). A Vanta effect has
   * no pause — its render loop either runs or does not exist — so pausing DESTROYS
   * a running instance (freeing its WebGL context, not just hiding its motion) and
   * resuming restarts it through the same lazy path as at boot.
   */
  toggle(): void {
    this.paused.update((v) => !v);
    if (this.paused()) this.stopEffect();
    else void this.applyEffect();
  }

  // ── configuration ─────────────────────────────────────────────────────────────

  /**
   * The theme's `--sd-bg-effect` declaration (or its `--hug-bg-effect` runtime
   * twin), parsed. The first token that HAS a value decides — the twins are emitted
   * together by the generator, so consulting the second is only ever a fallback for
   * a hand-written theme that set one and not the other. Mirrors login-ui's
   * themeEffectToken().
   */
  private themeEffectToken(): ThemeBackgroundEffect | null {
    if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null;
    const style = getComputedStyle(document.documentElement);
    for (const token of THEME_EFFECT_TOKENS) {
      const raw = style.getPropertyValue(token);
      if (raw && raw.trim()) return parseThemeBackgroundEffect(raw);
    }
    return null;
  }

  // ── rendering ─────────────────────────────────────────────────────────────────

  /** Render whatever the theme now declares, tearing down what was there. */
  private async applyEffect(): Promise<void> {
    if (!this.viewReady) return;
    this.stopEffect();
    const declared = this.themeEffect();
    if (isBackgroundEffect(declared) && !this.paused()) {
      await this.startEffect(declared);
    }
    // 'gradient' / 'none' / null need nothing: the wash is CSS and has been painted
    // since load ('none' merely stills it, via the is-flat class).
  }

  /**
   * Start one Vanta effect, or quietly stay on the gradient wash.
   *
   * Runs OUTSIDE the Angular zone in full — including the dynamic import. Vanta
   * drives a requestAnimationFrame loop and binds pointer listeners; inside the zone
   * each of those would schedule a change-detection pass, so a decorative backdrop
   * would re-render the whole shell 60 times a second.
   */
  private async startEffect(id: BackgroundEffectId): Promise<void> {
    if (this.reducedMotion()) return;
    // Cheap probe first: without WebGL the animation chunks (154 KB gzipped of
    // three.js, plus the effect) would be downloaded only for Vanta's own init to
    // fail behind its internal catch.
    if (!this.hasWebgl()) return;

    const token = ++this.startToken;
    const element = this.stage().nativeElement;

    await this.zone.runOutsideAngular(async () => {
      try {
        const { factory, three } = await this.loadEffect(id);
        // The theme may have re-declared (or the visitor paused / asked for reduced
        // motion) while the chunk was in flight; starting now would attach an
        // orphan GL context.
        if (
          token !== this.startToken ||
          this.themeEffect() !== id ||
          this.reducedMotion() ||
          this.paused()
        ) {
          return;
        }

        // Options are read AFTER the await so an effect that started during a theme
        // change opens on the new palette rather than on a frame of the old one.
        const options = vantaOptionsFor(id, this.palette());
        const instance = factory({ ...options, el: element, THREE: three });
        this.instance = instance;
        this.instanceEffect = id;
        this.watchContextLoss(element);
        this.zone.run(() => this.effectRunning.set(true));
      } catch {
        // Chunk fetch failed, WebGL died, Vanta threw: the themed wash is already
        // on screen and stays there. The routed content is untouched either way.
        this.instance = null;
        this.instanceEffect = null;
        this.zone.run(() => this.effectRunning.set(false));
      }
    });
  }

  private stopEffect(): void {
    this.startToken++;
    const instance = this.instance;
    this.instance = null;
    this.instanceEffect = null;
    this.effectRunning.set(false);
    if (!instance) return;
    try {
      instance.destroy();
    } catch {
      // Vanta's destroy() removes its canvas from the element it believes it owns and
      // can throw if its own init bailed early. Nothing left to clean up either way.
    }
  }

  /**
   * A lost GL context (GPU reset, driver crash, a tab backgrounded too long) fires
   * once and leaves a frozen canvas behind. Tear the effect down so the themed
   * wash shows through rather than a stale last frame.
   */
  private watchContextLoss(element: HTMLElement): void {
    const canvas = element.querySelector('canvas');
    if (!canvas) return;
    const onLost = () => this.zone.run(() => this.stopEffect());
    canvas.addEventListener('webglcontextlost', onLost, { once: true });
    this.teardown.push(() => canvas.removeEventListener('webglcontextlost', onLost));
  }

  // ── watchers ──────────────────────────────────────────────────────────────────

  /**
   * Reduced motion is watched, not just read once: the preference can be toggled
   * mid-session (an OS setting, or a user who reaches for it BECAUSE the page is
   * moving), and the animation must stop the moment it flips. The CSS wash's own
   * reduced-motion handling stays in the stylesheet, where it always was.
   */
  private watchReducedMotion(): void {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.set(query.matches);
    const onChange = (event: MediaQueryListEvent) => {
      this.zone.run(() => {
        this.reducedMotion.set(event.matches);
        if (event.matches) this.stopEffect();
        else void this.applyEffect();
      });
    };
    query.addEventListener('change', onChange);
    this.teardown.push(() => query.removeEventListener('change', onChange));
  }

  /**
   * Watch every mechanism that can change the theme, then decide by VALUE.
   *
   * The theme arrives as CSS, and CSS can change in ways that share no single
   * notification: the injected `snap-theme.css` finishing its load, a `:root` inline
   * style or `data-theme` attribute from a future switcher, a stylesheet being
   * swapped in `<head>`, or the OS flipping colour scheme. Rather than guess which
   * one a given deployment uses, all of them are observed and the palette is re-read;
   * a fingerprint comparison then throws away the (very many) notifications that
   * changed no colour, so the expensive part runs only on a real theme change.
   *
   * Registered outside the Angular zone because zone.js patches MutationObserver and
   * media-query listeners — otherwise every stylesheet Angular itself injects at boot
   * would schedule a change-detection pass.
   */
  private watchTheme(): void {
    if (typeof document === 'undefined') return;
    const refresh = () => this.schedulePaletteRead();

    this.zone.runOutsideAngular(() => {
      if (typeof MutationObserver === 'function') {
        const root = new MutationObserver(refresh);
        root.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style', 'class', 'data-theme'],
        });
        const head = new MutationObserver(refresh);
        head.observe(document.head, { childList: true, subtree: true });
        this.observers.push(root, head);
      }

      if (typeof matchMedia === 'function') {
        const scheme = matchMedia('(prefers-color-scheme: dark)');
        scheme.addEventListener('change', refresh);
        this.teardown.push(() => scheme.removeEventListener('change', refresh));
      }

      window.addEventListener(THEME_CHANGE_EVENT, refresh);
      this.teardown.push(() => window.removeEventListener(THEME_CHANGE_EVENT, refresh));

      // The runtime theme is a <link> that may still be in flight when the app
      // boots; without this the background would render the compiled fallback brand
      // until something else happened to mutate the DOM.
      for (const link of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
        link.addEventListener('load', refresh, { once: true });
      }
    });
  }

  /** Coalesce a burst of mutations into one palette read per frame. */
  private schedulePaletteRead(): void {
    if (this.paletteFrame) return;
    this.paletteFrame = requestAnimationFrame(() => {
      this.paletteFrame = 0;
      this.refreshTheme();
    });
  }

  /**
   * Re-read the tokens; publish only what actually moved.
   *
   * Two independent outcomes ride the same notification: a COLOUR change restyles a
   * running effect in place (via the palette signal → setOptions), while a
   * `--sd-bg-effect` change swaps the effect — the old instance is destroyed (Vanta
   * leaks its WebGL context otherwise) and the new effect starts through the same
   * lazy-load path as at boot.
   */
  private refreshTheme(): void {
    const nextPalette = readThemePalette();
    const nextEffect = this.themeEffectToken();
    const paletteChanged =
      paletteFingerprint(nextPalette) !== paletteFingerprint(this.palette());
    const effectChanged = nextEffect !== this.themeEffect();
    if (!paletteChanged && !effectChanged) return;

    this.zone.run(() => {
      if (paletteChanged) this.palette.set(nextPalette);
      if (effectChanged) {
        this.themeEffect.set(nextEffect);
        // Switching goes through applyEffect(), which destroys the running Vanta
        // instance BEFORE starting the next one — two instances on one element is a
        // leaked WebGL context and a doubled render loop — and whose start token
        // already makes a slow chunk load lose to a faster subsequent switch.
        void this.applyEffect();
      }
    });
  }
}
