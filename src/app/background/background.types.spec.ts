import {
  BACKGROUND_EFFECT_IDS,
  THEME_EFFECT_TOKENS,
  isBackgroundEffect,
  parseThemeBackgroundEffect,
  vantaOptionsFor,
} from './background.types';
import {
  FALLBACK_PALETTE,
  ThemePalette,
  hexToInt,
  normalizeHex,
  paletteFingerprint,
  readThemePalette,
} from './theme-tokens';

/** A pride-preset-shaped palette: saturated primary + secondary, dark ramp. */
const FLAG_PALETTE: ThemePalette = {
  bg0: '#0a0a12',
  bg1: '#12121e',
  text: '#e8e8f0',
  primary: '#e40303',
  secondary: '#ff8c00',
  accent: '#008026',
  accentSoft: '#61cf6b',
};

/**
 * The `--sd-bg-effect` parse contract, host-shell side. These specs MIRROR
 * login-ui's background.types.spec.ts — same tolerant-parse cases, same
 * forward-compatibility clause — with the ONE documented divergence: `none` stays
 * distinct here (this shell's gradient wash is animated, so `none` has a flatter
 * thing to render) where login-ui collapses it into `gradient`.
 */
describe('background.types', () => {
  describe('parseThemeBackgroundEffect (--sd-bg-effect contract)', () => {
    it('maps vanta-<name> to each bundled effect', () => {
      for (const id of BACKGROUND_EFFECT_IDS) {
        expect(parseThemeBackgroundEffect(`vanta-${id}`)).toBe(id);
      }
    });

    it('accepts the two non-animated declarations — and keeps them DISTINCT', () => {
      expect(parseThemeBackgroundEffect('gradient')).toBe('gradient');
      // Unlike login-ui (whose static layer is already still), this shell's wash is
      // an animation, so `none` must survive parsing as itself: it renders the wash
      // at rest, not the moving default.
      expect(parseThemeBackgroundEffect('none')).toBe('none');
    });

    it('is tolerant of the raw text a CSS custom property arrives as', () => {
      // getPropertyValue returns the author's raw token text: whitespace survives,
      // case is whatever was typed, and quoting the value is legal CSS.
      expect(parseThemeBackgroundEffect('  Vanta-FOG ')).toBe('fog');
      expect(parseThemeBackgroundEffect('"vanta-waves"')).toBe('waves');
      expect(parseThemeBackgroundEffect("'gradient'")).toBe('gradient');
      expect(parseThemeBackgroundEffect('  NONE ')).toBe('none');
    });

    it('degrades any unknown or unbundled value to gradient — the forward-compat clause', () => {
      // A future theme naming an effect this build does not bundle must get a clean
      // themed page, never a boot failure and never a dead rectangle.
      expect(parseThemeBackgroundEffect('vanta-birds')).toBe('gradient');
      expect(parseThemeBackgroundEffect('vanta-confetti')).toBe('gradient');
      expect(parseThemeBackgroundEffect('sparkles')).toBe('gradient');
      // The bare effect id is NOT contract vocabulary; unknown ⇒ gradient applies
      // to it too.
      expect(parseThemeBackgroundEffect('fog')).toBe('gradient');
    });

    it('returns null — "the theme said nothing" — only for absence, never for junk', () => {
      expect(parseThemeBackgroundEffect('')).toBeNull();
      expect(parseThemeBackgroundEffect('   ')).toBeNull();
      expect(parseThemeBackgroundEffect(undefined)).toBeNull();
      expect(parseThemeBackgroundEffect(null)).toBeNull();
      expect(parseThemeBackgroundEffect(42)).toBeNull();
    });

    it('tries --sd-bg-effect before its --hug-bg-effect runtime twin', () => {
      // The order is the contract: the generator emits both, and a consumer that
      // read the twin first would diverge from login-ui on a hand-written theme
      // that set the two to different values.
      expect(THEME_EFFECT_TOKENS).toEqual(['--sd-bg-effect', '--hug-bg-effect']);
    });
  });

  describe('isBackgroundEffect', () => {
    it('separates the animated declarations from the still ones', () => {
      expect(isBackgroundEffect('fog')).toBeTrue();
      expect(isBackgroundEffect('globe')).toBeTrue();
      expect(isBackgroundEffect('gradient')).toBeFalse();
      expect(isBackgroundEffect('none')).toBeFalse();
      expect(isBackgroundEffect(null)).toBeFalse();
    });
  });

  describe('vantaOptionsFor', () => {
    it('derives EVERY colour from the palette — no literal survives', () => {
      const themed: ThemePalette = { ...FALLBACK_PALETTE, primary: '#ff0000', accent: '#00ff00' };
      const options = vantaOptionsFor('fog', themed);
      expect(options['highlightColor']).toBe(hexToInt('#ff0000'));
      expect(options['lowlightColor']).toBe(hexToInt('#00ff00'));
      expect(options['baseColor']).toBe(hexToInt(themed.bg0));
    });

    it('yields DIFFERENT colour options for a different theme, for every effect', () => {
      // This is the property that makes a preset switch (pride flags included)
      // visible in the background instead of a silent no-op.
      for (const id of BACKGROUND_EFFECT_IDS) {
        const shipped = JSON.stringify(vantaOptionsFor(id, FALLBACK_PALETTE));
        const flag = JSON.stringify(vantaOptionsFor(id, FLAG_PALETTE));
        expect(flag).withContext(`effect ${id} follows the theme`).not.toEqual(shipped);
      }
    });

    it('leaves touch and gyro listeners off on every effect', () => {
      for (const id of BACKGROUND_EFFECT_IDS) {
        const options = vantaOptionsFor(id, FALLBACK_PALETTE);
        expect(options['touchControls']).withContext(`effect ${id}`).toBeFalse();
        expect(options['gyroControls']).withContext(`effect ${id}`).toBeFalse();
      }
    });

    it('emits plain numbers/booleans only, which is all Vanta options may be', () => {
      for (const id of BACKGROUND_EFFECT_IDS) {
        for (const [key, value] of Object.entries(vantaOptionsFor(id, FALLBACK_PALETTE))) {
          expect(['number', 'boolean'])
            .withContext(`${id}.${key} is ${typeof value}`)
            .toContain(typeof value);
        }
      }
    });
  });

  describe('theme-tokens (the palette the effects read)', () => {
    afterEach(() => {
      for (const token of ['--hug-primary', '--hug-accent', '--hug-bg-0']) {
        document.documentElement.style.removeProperty(token);
      }
    });

    it('normalises hex and rgb() author spellings, dropping alpha', () => {
      expect(normalizeHex('#abc')).toBe('#aabbcc');
      expect(normalizeHex('#AABBCCDD')).toBe('#aabbcc');
      expect(normalizeHex('rgb(255, 0, 128)')).toBe('#ff0080');
      expect(normalizeHex('linear-gradient(red, blue)')).toBeNull();
      expect(normalizeHex('')).toBeNull();
    });

    it('reads the live :root tokens, falling back per token', () => {
      document.documentElement.style.setProperty('--hug-primary', '#ff0000');
      const palette = readThemePalette();
      expect(palette.primary).toBe('#ff0000');
      // Tokens the "theme" above did not set keep a complete palette: either the
      // shell's own :root literals (styles.scss defines --hug-bg-0) or the
      // compiled fallback — never a half-black palette.
      expect(normalizeHex(palette.bg0)).withContext('bg0 stays a colour').not.toBeNull();
      expect(normalizeHex(palette.accentSoft)).not.toBeNull();
    });

    it('fingerprints by value, so watchers can drop no-op notifications', () => {
      expect(paletteFingerprint(FALLBACK_PALETTE)).toBe(paletteFingerprint({ ...FALLBACK_PALETTE }));
      expect(paletteFingerprint(FALLBACK_PALETTE)).not.toBe(paletteFingerprint(FLAG_PALETTE));
    });
  });
});
