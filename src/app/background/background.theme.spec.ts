import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BackgroundComponent } from './background.component';

/**
 * Theme -> background colour derivation (issue #19).
 *
 * The moving gradient must take its colours from the ACTIVE theme — the
 * runtime `--sd-*` custom properties that docker-entrypoint.d/50-snap-theme.sh
 * injects as snap-theme.css — and it must do so LIVE, with no reload and no
 * change-detection pass, because the derivation is pure CSS var() resolution.
 *
 * These specs drive the same mechanism the runtime uses: a custom property on
 * `document.documentElement` (`:root`) is exactly where the injected
 * `:root:root` theme block and any future in-page switcher land, so what is
 * asserted here is the real contract, not a simulation of it.
 *
 * Colour literals are asserted in the `rgb(r, g, b)` form because that is how
 * the CSS engine serialises computed <color> values inside a gradient.
 */
describe('BackgroundComponent theme derivation', () => {
  let fixture: ComponentFixture<BackgroundComponent>;
  let host: HTMLElement;

  /** Every token a spec below may set; cleared after each spec so nothing leaks. */
  const THEME_TOKENS = [
    '--sd-bg-gradient',
    '--sd-primary',
    '--sd-primary-bright',
    '--sd-primary-soft',
    '--sd-secondary',
    '--sd-secondary-bright',
    '--sd-secondary-soft',
  ] as const;

  /** The compiled pastel fallbacks (src/styles/_tokens.scss), rgb-serialised. */
  const PASTELS = {
    rose: 'rgb(255, 200, 221)', // $pastel-rose     #ffc8dd
    lavender: 'rgb(208, 180, 245)', // $pastel-lavender #d0b4f5
    sky: 'rgb(189, 224, 254)', // $pastel-sky      #bde0fe
    mint: 'rgb(202, 255, 191)', // $pastel-mint     #caffbf
    lemon: 'rgb(253, 255, 182)', // $pastel-lemon    #fdffb6
    peach: 'rgb(255, 214, 165)', // $pastel-peach    #ffd6a5
  } as const;

  const setToken = (name: string, value: string) =>
    document.documentElement.style.setProperty(name, value);

  const backgroundImage = () => getComputedStyle(host).backgroundImage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BackgroundComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BackgroundComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const token of THEME_TOKENS) {
      document.documentElement.style.removeProperty(token);
    }
  });

  describe('un-themed deploy (zero-byte snap-theme.css)', () => {
    it('renders the shipped pastel wash, all six stops, byte-compatible with the pre-theme backdrop', () => {
      const bg = backgroundImage();
      expect(bg).withContext('still a gradient').toContain('linear-gradient');
      for (const [name, rgb] of Object.entries(PASTELS)) {
        expect(bg).withContext(`pastel ${name} present`).toContain(rgb);
      }
    });

    it('keeps the shipped stop ORDER (rose → lavender → sky → mint → lemon → peach)', () => {
      const bg = backgroundImage();
      const order = [
        PASTELS.rose,
        PASTELS.lavender,
        PASTELS.sky,
        PASTELS.mint,
        PASTELS.lemon,
        PASTELS.peach,
      ].map((rgb) => bg.indexOf(rgb));
      expect(order.every((i) => i >= 0)).withContext('all stops found').toBeTrue();
      expect([...order].sort((a, b) => a - b))
        .withContext('stops appear in the shipped order')
        .toEqual(order);
    });
  });

  describe("tier 1 — the theme's designated wash (--sd-bg-gradient)", () => {
    it('IS the background when the theme provides it', () => {
      setToken(
        '--sd-bg-gradient',
        'linear-gradient(135deg, rgb(1, 2, 3) 0%, rgb(4, 5, 6) 100%)',
      );
      const bg = backgroundImage();
      expect(bg).toContain('rgb(1, 2, 3)');
      expect(bg).toContain('rgb(4, 5, 6)');
      expect(bg)
        .withContext('no shipped pastel survives a themed wash')
        .not.toContain(PASTELS.rose);
    });

    it('wins over the brand-ramp tokens when both are present', () => {
      setToken('--sd-primary-bright', '#070809');
      setToken(
        '--sd-bg-gradient',
        'linear-gradient(135deg, rgb(1, 2, 3) 0%, rgb(4, 5, 6) 100%)',
      );
      const bg = backgroundImage();
      expect(bg).toContain('rgb(1, 2, 3)');
      expect(bg)
        .withContext('ramp token ignored while the wash exists')
        .not.toContain('rgb(7, 8, 9)');
    });
  });

  describe('tier 2 — brand-ramp stops for a hand-typed theme with no wash token', () => {
    it('builds every stop from the theme brand ramp', () => {
      setToken('--sd-primary-bright', '#010203');
      setToken('--sd-secondary-bright', '#040506');
      setToken('--sd-primary-soft', '#070809');
      setToken('--sd-secondary-soft', '#0a0b0c');
      setToken('--sd-primary', '#0d0e0f');
      setToken('--sd-secondary', '#101112');

      const bg = backgroundImage();
      for (const rgb of [
        'rgb(1, 2, 3)',
        'rgb(4, 5, 6)',
        'rgb(7, 8, 9)',
        'rgb(10, 11, 12)',
        'rgb(13, 14, 15)',
        'rgb(16, 17, 18)',
      ]) {
        expect(bg).withContext(`themed stop ${rgb}`).toContain(rgb);
      }
      for (const [name, rgb] of Object.entries(PASTELS)) {
        expect(bg)
          .withContext(`pastel ${name} fully replaced`)
          .not.toContain(rgb);
      }
    });

    it('falls back PER TOKEN: a partial theme keeps pastels for the stops it does not set', () => {
      setToken('--sd-primary', '#0d0e0f');
      const bg = backgroundImage();
      expect(bg).withContext('the themed stop').toContain('rgb(13, 14, 15)');
      expect(bg)
        .withContext('the lemon slot is the one --sd-primary replaces')
        .not.toContain(PASTELS.lemon);
      expect(bg).withContext('untouched stop stays pastel').toContain(PASTELS.rose);
      expect(bg).withContext('untouched stop stays pastel').toContain(PASTELS.sky);
    });
  });

  describe('live updates', () => {
    it('recolours the moment a token changes — no reload, no change-detection pass', () => {
      const before = backgroundImage();
      setToken(
        '--sd-bg-gradient',
        'linear-gradient(135deg, rgb(1, 2, 3) 0%, rgb(4, 5, 6) 100%)',
      );
      // Deliberately NO fixture.detectChanges(): resolution is the CSS
      // engine's, which is the entire point of deriving through var().
      const themed = backgroundImage();
      expect(themed).not.toBe(before);
      expect(themed).toContain('rgb(1, 2, 3)');

      document.documentElement.style.removeProperty('--sd-bg-gradient');
      expect(backgroundImage())
        .withContext('un-theming restores the shipped wash just as live')
        .toContain(PASTELS.rose);
    });
  });

  describe('the moving-gradient sweep survives theming', () => {
    // `background:` is a SHORTHAND and resets background-size; these pin that
    // the var()-carrying shorthand still loses to the later longhand, under
    // both the fallback and a themed wash. Losing the 400% canvas would leave
    // a static gradient that merely claims to animate.
    it('keeps the 400% canvas and the bg-shift animation on the fallback wash', () => {
      const style = getComputedStyle(host);
      expect(style.backgroundSize).toBe('400% 400%');
      expect(style.animationName).toContain('bg-shift');
    });

    it('keeps them when a theme wash is active', () => {
      setToken(
        '--sd-bg-gradient',
        'linear-gradient(135deg, rgb(1, 2, 3) 0%, rgb(4, 5, 6) 100%)',
      );
      const style = getComputedStyle(host);
      expect(style.backgroundSize).toBe('400% 400%');
      expect(style.animationName).toContain('bg-shift');
    });
  });
});
