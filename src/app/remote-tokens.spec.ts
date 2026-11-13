// A module, not a global script: without an import/export TypeScript puts these
// helpers in the global scope, where they collide with other specs' copies.
export {};

/**
 * Tokens the federated remotes read must be DEFINED by the shell (WCAG 1.4.3 /
 * 1.4.11). A remote renders here without its own global stylesheet, so a token
 * only that stylesheet declares is undefined in the mesh: the read falls to a
 * low-contrast literal, or, with no fallback, the declaration drops and the
 * edge or fill vanishes. These read the values the compiled shell sheet gives.
 */

type RGB = [number, number, number];

function luminance([r, g, b]: RGB): number {
  const chan = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Resolve a custom property to a computed rgb() by painting it as text. */
function resolved(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token}, rgb(1, 2, 3))`;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

function rgb(css: string): RGB {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) throw new Error(`could not parse colour: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const UNDEFINED = 'rgb(1, 2, 3)';
const CARD: RGB = [0x12, 0x12, 0x1e];

describe('tokens the remotes read are defined by the shell', () => {
  for (const token of ['--hug-ok', '--hug-warning', '--hug-muted']) {
    it(`${token} is defined and reads >= 4.5:1 as text on --hug-bg-1`, () => {
      const c = resolved(token);
      expect(c).withContext(`${token} is undefined in the shell`).not.toBe(UNDEFINED);
      expect(contrast(rgb(c), CARD)).withContext(`${token} ${c}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const family of ['forum', 'wiki', 'tube', 'owncast']) {
    for (const slot of ['bg', 'surface', 'border', 'text', 'text-muted', 'accent', 'accent-soft', 'success', 'error']) {
      it(`--${family}-${slot} is defined`, () => {
        expect(resolved(`--${family}-${slot}`)).not.toBe(UNDEFINED);
      });
    }
  }

  for (const family of ['wiki', 'tube', 'owncast']) {
    it(`--${family}-warning is defined`, () => {
      expect(resolved(`--${family}-warning`)).not.toBe(UNDEFINED);
    });
  }
});
