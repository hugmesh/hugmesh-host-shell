import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, OnDestroy, Signal, inject, signal } from '@angular/core';

import { THEME_CHANGE_EVENT } from '../background/background.component';
import { ChromeSurface, isChromeHidden, readChromeContent } from './chrome-tokens';

/**
 * The live half of the theme CHROME contract: the header's and footer's
 * REPLACEMENT TEXT (`--sd-header-content` / `--sd-footer-content`), exposed as
 * signals the two surfaces render as ordinary markup.
 *
 * Only the text axis is here. Hiding a surface, its height, its flat background
 * and that background's text twin are pure `var()` fallback chains in the
 * surfaces' own stylesheets — a stylesheet is applied before any component runs,
 * so a header the theme hides never flashes, and the un-themed page renders
 * byte-identically with no JavaScript involved at all. Text is the one axis that
 * has to be code, because the generator's contract offers consumers a choice
 * between a CSS `content:` read paired with alt-text syntax and REAL MARKUP, and
 * only the second puts the operator's words in the accessibility tree, the page's
 * text selection and the document outline.
 *
 * WATCHING, and why it is not "read once at boot": the runtime theme arrives as a
 * `<link>` that `docker-entrypoint.d/50-snap-theme.sh` writes at container start,
 * and it may still be in flight when Angular bootstraps. The same four triggers
 * `BackgroundComponent.watchTheme()` uses are therefore honoured here — head
 * mutations, root attribute changes, a stylesheet finishing loading, and the
 * shell's own `hug-theme-change` event — because a chrome axis that updates on a
 * theme swap while the background does not (or vice versa) is exactly the kind of
 * half-applied theme this system has already shipped once.
 *
 * Registered outside the Angular zone: zone.js patches MutationObserver, so every
 * stylesheet Angular itself injects at boot would otherwise schedule a
 * change-detection pass. The signal write inside the callback is what brings the
 * result back into the framework.
 */
@Injectable({ providedIn: 'root' })
export class ChromeThemeService implements OnDestroy {
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  private readonly text: Record<ChromeSurface, ReturnType<typeof signal<string | null>>> = {
    header: signal<string | null>(null),
    footer: signal<string | null>(null),
  };

  /** `--sd-<s>-display: none`, per surface. Only the HEADER consumes this signal
   *  — see {@link isChromeHidden} for why one surface hides itself in CSS and the
   *  other has to be told in code. Watched by the same observers as the text, so
   *  a theme that arrives after bootstrap collapses the banner exactly as one
   *  present at boot does. */
  private readonly hide: Record<ChromeSurface, ReturnType<typeof signal<boolean>>> = {
    header: signal(false),
    footer: signal(false),
  };

  private readonly observers: MutationObserver[] = [];
  private readonly teardown: Array<() => void> = [];
  private frame = 0;

  constructor() {
    this.read();
    this.watch();
  }

  ngOnDestroy(): void {
    for (const off of this.teardown) off();
    this.teardown.length = 0;
    for (const observer of this.observers) observer.disconnect();
    this.observers.length = 0;
    if (this.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /**
   * The theme's replacement text for a surface, or `null` when the theme said
   * nothing — in which case the surface renders exactly the content it ships.
   */
  content(surface: ChromeSurface): Signal<string | null> {
    return this.text[surface].asReadonly();
  }

  /**
   * Whether the theme asks for this surface to be hidden outright
   * (`--sd-<s>-display: none`, or its `--hug-` twin).
   */
  hidden(surface: ChromeSurface): Signal<boolean> {
    return this.hide[surface].asReadonly();
  }

  /** Re-read both surfaces now. Public so a spec (or a future in-page theme
   *  switcher) can force a read without faking a DOM mutation. */
  refresh(): void {
    this.read();
  }

  private read(): void {
    const root = this.doc?.documentElement ?? null;
    for (const surface of ['header', 'footer'] as const) {
      const next = readChromeContent(surface, root);
      if (this.text[surface]() !== next) this.text[surface].set(next);
      const hidden = isChromeHidden(surface, root);
      if (this.hide[surface]() !== hidden) this.hide[surface].set(hidden);
    }
  }

  private watch(): void {
    const doc = this.doc;
    if (!doc || typeof MutationObserver !== 'function') return;
    const refresh = () => this.schedule();

    this.zone.runOutsideAngular(() => {
      const root = new MutationObserver(refresh);
      root.observe(doc.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class', 'data-theme'],
      });
      const head = new MutationObserver(refresh);
      head.observe(doc.head, { childList: true, subtree: true });
      this.observers.push(root, head);

      if (typeof window !== 'undefined') {
        window.addEventListener(THEME_CHANGE_EVENT, refresh);
        this.teardown.push(() => window.removeEventListener(THEME_CHANGE_EVENT, refresh));
      }

      for (const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))) {
        link.addEventListener('load', refresh, { once: true });
      }
    });
  }

  /** Coalesce a burst of mutations into one read per frame. */
  private schedule(): void {
    if (this.frame || typeof requestAnimationFrame !== 'function') {
      if (!this.frame) this.read();
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.read();
    });
  }
}
