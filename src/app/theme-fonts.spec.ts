/**
 * The theme's face reaches the shell (it used to reach only the login page), and the
 * selection highlight uses the accent pair the theme pipeline guarantees AA for.
 * Reads the compiled global stylesheet the browser actually applies.
 */
describe('theme fonts and selection', () => {
  const root = document.documentElement;
  afterEach(() => {
    root.style.removeProperty('--hug-font-sans');
    root.style.removeProperty('--hug-font-mono');
    root.style.removeProperty('--hug-accent');
    root.style.removeProperty('--hug-accent-on');
  });

  it('body text follows --hug-font-sans', () => {
    root.style.setProperty('--hug-font-sans', '"Courier New", monospace');
    expect(getComputedStyle(document.body).fontFamily).toContain('Courier New');
  });

  it('unthemed body text keeps the compiled stack', () => {
    expect(getComputedStyle(document.body).fontFamily).toContain('Arial');
  });

  it('code follows --hug-font-mono', () => {
    root.style.setProperty('--hug-font-mono', '"DejaVu Sans Mono", monospace');
    const code = document.createElement('code');
    document.body.appendChild(code);
    try {
      expect(getComputedStyle(code).fontFamily).toContain('DejaVu Sans Mono');
    } finally {
      code.remove();
    }
  });

  it('a field inherits the themed face', () => {
    root.style.setProperty('--hug-font-sans', '"Courier New", monospace');
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      expect(getComputedStyle(input).fontFamily).toContain('Courier New');
    } finally {
      input.remove();
    }
  });

  it('::selection paints the filled accent with its derived on-colour', () => {
    root.style.setProperty('--hug-accent', 'rgb(252, 244, 52)');
    root.style.setProperty('--hug-accent-on', 'rgb(0, 0, 0)');
    const p = document.createElement('p');
    p.textContent = 'x';
    document.body.appendChild(p);
    try {
      const sel = getComputedStyle(p, '::selection');
      expect(sel.backgroundColor).toBe('rgb(252, 244, 52)');
      expect(sel.color).toBe('rgb(0, 0, 0)');
    } finally {
      p.remove();
    }
  });
});
