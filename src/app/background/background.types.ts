/**
 * The host shell's side of the theme background-effect contract.
 *
 * MIRRORS hugmesh-login-ui's `src/app/background.types.ts` (merged login-ui PR #6)
 * on purpose, function for function and case for case: `--sd-bg-effect` is ONE
 * cross-repo token (the `--sd-*` namespace this repo's own PR #20 standardised the
 * background on), and the way the two front doors of the platform read it must not
 * drift, or the same theme would animate one page and not the other. When editing
 * anything here, diff it against login-ui's copy first.
 *
 * Pure data + pure functions on purpose — everything here is decided WITHOUT a DOM,
 * a WebGL context or a network fetch, so the interesting decisions are
 * unit-testable rather than "looks fine on my machine". {@link BackgroundComponent}
 * owns the effects.
 */
import { ThemePalette, hexToInt } from './theme-tokens';

/**
 * The animated presets. This list is EMPIRICAL, not aspirational (login-ui's
 * finding, inherited verbatim): every id here was verified to actually render
 * against the three.js revision this platform ships. Vanta's `birds`, `dots` and
 * friends were dropped because they call three.js APIs removed years ago
 * (`THREE.Geometry`, `THREE.VertexColors`) — Vanta CATCHES that internally and
 * silently falls back to a flat colour, so shipping one would have looked like a
 * working option and rendered a dead rectangle.
 */
export type BackgroundEffectId = 'fog' | 'waves' | 'net' | 'globe';

export const BACKGROUND_EFFECT_IDS: readonly BackgroundEffectId[] = ['fog', 'waves', 'net', 'globe'];

// ── the theme-declared background effect (`--sd-bg-effect`) ──────────────────────

/**
 * What a THEME can say about the background. Unlike login-ui — whose static layer
 * is a STILL gradient, leaving it "no flatter thing to paint" and letting it
 * collapse `none` into `gradient` — this shell's gradient is an ANIMATED wash
 * (background.component.scss's bg-shift sweep + shimmer), so `none` is kept
 * DISTINCT here and renders the wash at rest: same colours, zero motion. That is
 * the one deliberate divergence from login-ui's parse, and it is the contract's own
 * text ("`none` — no animated effect") applied to a consumer that has an animation
 * to switch off. `null` is a third state — the theme said nothing — in which the
 * shell's own default (the animated wash) applies.
 */
export type ThemeBackgroundEffect = BackgroundEffectId | 'gradient' | 'none';

/**
 * The custom properties the declaration arrives on, in the order they are tried.
 *
 * `--sd-bg-effect` is the cross-repo contract token; `--hug-bg-effect` is its
 * runtime twin — the generator's `css_root` emits every `--sd-*` token a second
 * time under the `--hug-*` prefix, and this platform has already been burned once
 * by reading only one side of that pair (the theme rollout's prefix bug).
 */
export const THEME_EFFECT_TOKENS: readonly string[] = ['--sd-bg-effect', '--hug-bg-effect'];

/**
 * Parse one `--sd-bg-effect` declaration. The contract (login-ui README
 * "Theme-declared effect", shared with this repo's issue #19) is:
 *
 *   - `gradient` — the theme wants the plain themed background. The DEFAULT.
 *                  Here that is the shell's animated wash, exactly as shipped.
 *   - `none`     — no animated effect. Here the wash is rendered AT REST (see
 *                  {@link ThemeBackgroundEffect} for why this consumer does not
 *                  collapse it into `gradient` the way login-ui does).
 *   - `vanta-<name>` — one of the bundled Vanta effects (`vanta-fog`, `vanta-waves`,
 *                  `vanta-net`, `vanta-globe`).
 *   - anything else — including a `vanta-<effect>` this build does not bundle —
 *                  MUST degrade to `gradient`. That is the forward-compatibility
 *                  clause: a future theme naming an effect this build has never
 *                  heard of gets a clean themed page, not a boot failure.
 *
 * Parsing is tolerant the way a CSS custom property demands: `getPropertyValue`
 * returns the token's RAW text, so case, whitespace and an author's optional quotes
 * are all normalised away. `null` means "the theme said nothing" (absent/empty),
 * never "the theme said something invalid" — invalid is `gradient` by contract.
 */
export function parseThemeBackgroundEffect(raw: unknown): ThemeBackgroundEffect | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim().toLowerCase();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (!value) return null;
  if (value === 'gradient') return 'gradient';
  if (value === 'none') return 'none';
  if (value.startsWith('vanta-')) {
    const id = value.slice('vanta-'.length);
    if ((BACKGROUND_EFFECT_IDS as readonly string[]).includes(id)) return id as BackgroundEffectId;
  }
  return 'gradient';
}

/** Whether a parsed declaration names one of the animated (Vanta) effects. */
export function isBackgroundEffect(
  effect: ThemeBackgroundEffect | null,
): effect is BackgroundEffectId {
  return effect !== null && (BACKGROUND_EFFECT_IDS as readonly string[]).includes(effect);
}

/** Options every effect shares. Byte-for-byte login-ui's `commonOptions()`. */
function commonOptions(): Record<string, number | boolean> {
  return {
    // Pointer parallax is a nice touch and costs nothing. TOUCH and GYRO are OFF:
    // both register non-passive window listeners that would compete with scrolling
    // and device motion on the phone someone is browsing the mesh from.
    mouseControls: true,
    touchControls: false,
    gyroControls: false,
    minHeight: 200,
    minWidth: 200,
    // Vanta's default scale of 2 (4 on mobile) renders at multiples of CSS pixels.
    // For a backdrop sitting UNDER the shell's opaque routed-content backpane that
    // is invisible detail bought with real GPU time, so both are pinned to 1.
    scale: 1,
    scaleMobile: 1,
  };
}

/**
 * The Vanta options for one effect, derived ENTIRELY from the live theme palette.
 * Byte-for-byte login-ui's `vantaOptionsFor()` — same effects, same option values —
 * so the login page's backdrop and the signed-in shell's backdrop render the SAME
 * effect identically for a given theme.
 *
 * Every colour is a `--hug-*` token read at runtime — there is no palette in this
 * file — which is what makes the background follow a preset change (pride flags
 * included) instead of needing its own copy of the brand. All four shipped effects
 * re-read their colour options inside Vanta's per-frame `onUpdate`, so pushing a new
 * palette through `setOptions()` restyles them LIVE, with no teardown and no reload.
 */
export function vantaOptionsFor(
  id: BackgroundEffectId,
  palette: ThemePalette,
): Record<string, number | boolean> {
  const base = commonOptions();
  switch (id) {
    case 'fog':
      // Fog reads as a slow gradient wash: the brand's three colours over the page
      // backdrop, so a rebrand is visible in the background within one frame.
      return {
        ...base,
        highlightColor: hexToInt(palette.primary),
        midtoneColor: hexToInt(palette.secondary),
        lowlightColor: hexToInt(palette.accent),
        baseColor: hexToInt(palette.bg0),
        blurFactor: 0.55,
        speed: 0.9,
        zoom: 0.9,
      };
    case 'waves':
      // A lit surface, so the colour wants to be the ACCENT (a mid-tone the theme
      // guarantees is distinct from both the backdrop and the text) rather than the
      // primary, which on the shipped brand is a near-white yellow.
      return {
        ...base,
        color: hexToInt(palette.accent),
        shininess: 30,
        waveHeight: 12,
        waveSpeed: 0.6,
        zoom: 0.85,
      };
    case 'net':
      // Points-and-lines: the one preset that literally draws a mesh, which is the
      // platform's own metaphor. Fewer points than Vanta's default — this is a
      // backdrop behind the shell's routed content, not the page's subject.
      return {
        ...base,
        color: hexToInt(palette.primary),
        backgroundColor: hexToInt(palette.bg0),
        points: 8,
        maxDistance: 22,
        spacing: 17,
        showDots: true,
      };
    case 'globe':
      return {
        ...base,
        color: hexToInt(palette.primary),
        color2: hexToInt(palette.accentSoft),
        backgroundColor: hexToInt(palette.bg0),
        size: 0.9,
        points: 8,
        maxDistance: 22,
        spacing: 17,
      };
  }
}
