// A module, not a global script: without an import/export TypeScript puts these
// helpers in the global scope, where they collide with other specs' copies.
export {};

/**
 * Form-field edge contract (WCAG 1.4.11, non-text contrast >= 3:1).
 *
 * The federated remotes draw their fields with `border: 1px solid
 * var(--hug-border)` (or a per-app alias such as --wiki-border), and render
 * inside THIS document with none of their own global stylesheet. --hug-border
 * is #1e1e32, which is 1.04-1.21:1 on the dark surfaces: a text box on a black
 * page had no visible edge at all.
 *
 * styles.scss re-points those tokens on the field element itself. These tests
 * mount fields styled exactly the way the remotes style them (a scoped rule
 * standing in for Angular's emulated encapsulation), read the border colour the
 * browser actually computes, and require 3:1 against every dark surface the
 * shell paints. They also pin the two things the change must NOT do: undo a
 * deliberate `border: none`, or beat a component's own state colour.
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

function rgb(css: string): RGB {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) throw new Error(`could not parse colour: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The dark surfaces a field sits on: --hug-bg-0, --hug-bg-1, a $surface card,
 *  and the backpane scrim composited over a pure-white theme gradient. */
const SURFACES: Record<string, RGB> = {
  'bg-0 #0a0a12': [0x0a, 0x0a, 0x12],
  'bg-1 #12121e': [0x12, 0x12, 0x1e],
  'surface #1c1c1c': [0x1c, 0x1c, 0x1c],
  'scrim over white #363636': [0x36, 0x36, 0x36],
};

describe('form-field edges (WCAG 1.4.11)', () => {
  let host: HTMLElement;
  let style: HTMLStyleElement;

  beforeEach(() => {
    // Stand-in for a remote's emulated-encapsulation component styles:
    // `input[_ngcontent-x]` is specificity (0,1,1), as Angular compiles it.
    style = document.createElement('style');
    style.textContent = `
      [data-fc] input[data-x], [data-fc] textarea[data-x], [data-fc] select[data-x] {
        border: 1px solid var(--hug-border, #3a3a3a); background: #12121e; color: #e8e8f0;
      }
      [data-fc] .wiki { --wiki-border: var(--hug-border); }
      [data-fc] .wiki input[data-x] { border: 1px solid var(--wiki-border); }
      [data-fc] input[data-none] { border: none; }
      [data-fc] input[data-own] { border-color: rgb(255, 0, 0); }
    `;
    document.head.appendChild(style);
    host = document.createElement('div');
    host.setAttribute('data-fc', '');
    host.style.background = '#0a0a12';
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    style.remove();
  });

  function mount(html: string): HTMLElement {
    host.innerHTML = html;
    return host.firstElementChild as HTMLElement;
  }

  function edgeOf(el: Element): RGB {
    return rgb(getComputedStyle(el).borderTopColor);
  }

  for (const [tag, html] of [
    ['input[type=text]', '<input data-x type="text" />'],
    ['input (no type)', '<input data-x />'],
    ['textarea', '<textarea data-x></textarea>'],
    ['select', '<select data-x><option>a</option></select>'],
  ] as const) {
    it(`${tag} drawn with var(--hug-border) has a >= 3:1 edge on every dark surface`, () => {
      const edge = edgeOf(mount(html));
      for (const [name, surface] of Object.entries(SURFACES)) {
        const ratio = contrast(edge, surface);
        expect(ratio)
          .withContext(`${tag} edge rgb(${edge}) on ${name}: ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('an app alias resolved on an ancestor (--wiki-border) follows the field token', () => {
    const wrap = mount('<div class="wiki"><input data-x type="text" /></div>');
    const edge = edgeOf(wrap.querySelector('input')!);
    expect(contrast(edge, SURFACES['bg-1 #12121e'])).toBeGreaterThanOrEqual(3);
  });

  it('checkboxes and radios do not take the text-field edge', () => {
    const wrap = mount('<div><input data-x type="checkbox" /><input data-x type="radio" /><input data-x type="text" /></div>');
    const [box, radio, text] = Array.from(wrap.querySelectorAll('input'));
    const fieldEdge = getComputedStyle(text).borderTopColor;
    expect(getComputedStyle(box).borderTopColor).not.toBe(fieldEdge);
    expect(getComputedStyle(radio).borderTopColor).not.toBe(fieldEdge);
  });

  it('a deliberate border: none stays none', () => {
    const el = mount('<input data-none type="text" />');
    expect(getComputedStyle(el).borderTopStyle).toBe('none');
  });

  it("a component's own border colour still wins", () => {
    // [data-fc] input[data-own] is (0,2,1), like a scoped `.field input:focus`.
    const el = mount('<input data-x data-own type="text" />');
    expect(getComputedStyle(el).borderTopColor).toBe('rgb(255, 0, 0)');
  });

  it('an invalid field is edged in the error colour', () => {
    const wrap = mount('<div><input data-x type="text" aria-invalid="true" /><span style="color: var(--hug-error)"></span></div>');
    const error = getComputedStyle(wrap.querySelector('span')!).color;
    expect(getComputedStyle(wrap.querySelector('input')!).borderTopColor).toBe(error);
  });
});
