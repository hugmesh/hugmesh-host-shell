import { TestBed } from '@angular/core/testing';

import { FooterComponent } from './footer/footer.component';

/**
 * Scrim legibility contract.
 *
 * <app-background> paints a full-viewport gradient behind everything. Its colours
 * are THEME-SUPPLIED (`--sd-bg-gradient`, see background.component.scss), so they
 * can be any luminance at all — the shipped fallback is a set of near-white
 * pastels, and a themed deploy may legitimately go brighter still.
 *
 * Nothing in this shell paints text straight onto that gradient. Two translucent
 * scrims stand between it and the content:
 *
 *   - `router-outlet + *` (styles.scss)  — the backpane, under every routed view
 *     including the federated remotes (login, Matrix, wiki, forum…).
 *   - `glass-float` (styles/_mixins.scss) — the header / footer / menu chrome.
 *
 * A scrim's ALPHA is what decides whether the palette's contrast ratios survive
 * that composition. Those ratios are quoted against an opaque #0a0a12 and are
 * simply false once the backdrop shows through: at alpha 0.62 the muted token
 * measured 2.5:1 on the live page — the palette comment claims 8.77:1.
 *
 * These tests read the alpha the stylesheets ACTUALLY compile to, composite it
 * over the worst backdrop a theme can produce (pure white) plus every shipped
 * pastel stop, and require WCAG AA on the real result. A regression that trades
 * alpha away for a stronger frost turns them red.
 */

type RGB = [number, number, number];

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: RGB): number {
  const chan = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG 2.x contrast ratio between two opaque colours. */
function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Source-over composite of a translucent scrim onto an opaque backdrop. */
function composite(scrim: RGB, alpha: number, backdrop: RGB): RGB {
  return [0, 1, 2].map(
    (i) => alpha * scrim[i] + (1 - alpha) * backdrop[i],
  ) as RGB;
}

/** Parse a computed `rgb()` / `rgba()` string into channels + alpha. */
function parseColor(css: string): { rgb: RGB; alpha: number } {
  const m = css.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/,
  );
  if (!m) throw new Error(`could not parse colour: ${css}`);
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
}

// WCAG 2.1 SC 1.4.3 Contrast (Minimum), normal-size text.
const AA = 4.5;

/**
 * Worst-case backdrops. Pure white is the bound a themed `--sd-bg-gradient` can
 * reach; the pastels are the compiled fallbacks an un-themed deploy actually
 * serves (styles/_tokens.scss).
 */
const BACKDROPS: ReadonlyArray<readonly [string, RGB]> = [
  ['a themed pure-white gradient', [255, 255, 255]],
  ['$pastel-rose #ffc8dd', [255, 200, 221]],
  ['$pastel-lavender #d0b4f5', [208, 180, 245]],
  ['$pastel-sky #bde0fe', [189, 224, 254]],
  ['$pastel-mint #caffbf', [202, 255, 191]],
  ['$pastel-lemon #fdffb6', [253, 255, 182]],
  ['$pastel-peach #ffd6a5', [255, 214, 165]],
];

/** The text tokens that ride on these scrims (styles.scss :root). */
const FOREGROUNDS: ReadonlyArray<readonly [string, RGB]> = [
  ['--hug-text #e8e8f0', [232, 232, 240]],
  ['--hug-text-muted #a8acc4', [168, 172, 196]],
  ['$offwhite body copy #e8e8e8', [232, 232, 232]],
  ['$neon wordmark/links #ffd700', [255, 215, 0]],
];

/** Assert every token clears AA on `scrim` over every worst-case backdrop. */
function expectScrimIsLegible(label: string, scrim: RGB, alpha: number): void {
  expect(alpha)
    .withContext(`${label}: expected a translucent scrim, got alpha ${alpha}`)
    .toBeLessThanOrEqual(1);

  for (const [bgName, backdrop] of BACKDROPS) {
    const painted = composite(scrim, alpha, backdrop);
    for (const [fgName, fg] of FOREGROUNDS) {
      const ratio = contrast(painted, fg);
      expect(ratio)
        .withContext(
          `${label} (alpha ${alpha}) over ${bgName}: ${fgName} renders at ` +
            `${ratio.toFixed(2)}:1, below WCAG AA ${AA}:1. The scrim is too ` +
            `transparent — raise $scrim-alpha in styles/_tokens.scss.`,
        )
        .toBeGreaterThanOrEqual(AA);
    }
  }
}

describe('scrim legibility over the themeable background gradient', () => {
  it('the routed-content backpane keeps every text token at WCAG AA', () => {
    // src/styles.scss is loaded into the karma bundle (angular.json → test.styles),
    // so the real `router-outlet + *` rule applies to a live DOM probe.
    const host = document.createElement('div');
    host.innerHTML = '<router-outlet></router-outlet><div id="backpane"></div>';
    document.body.appendChild(host);
    try {
      const probe = host.querySelector<HTMLElement>('#backpane')!;
      const { rgb, alpha } = parseColor(
        getComputedStyle(probe).backgroundColor,
      );
      expect(alpha)
        .withContext(
          'the backpane must actually paint a scrim — a fully transparent ' +
            'routed view puts body copy straight on the pastel gradient',
        )
        .toBeGreaterThan(0);
      expectScrimIsLegible('router-outlet + * backpane', rgb, alpha);
    } finally {
      host.remove();
    }
  });

  it('the glass-float chrome keeps every text token at WCAG AA', async () => {
    // FooterComponent is the smallest glass-float consumer; header/menu/profile-modal
    // share the mixin, so one probe covers the idiom.
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();

    const hostEl = fixture.nativeElement as HTMLElement;
    const { rgb, alpha } = parseColor(getComputedStyle(hostEl).backgroundColor);
    expectScrimIsLegible('glass-float chrome', rgb, alpha);
  });
});
