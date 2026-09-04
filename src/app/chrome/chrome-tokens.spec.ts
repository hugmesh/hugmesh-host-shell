import {
  CHROME_SURFACES,
  chromeTokens,
  parseChromeContent,
  readChromeContent,
} from './chrome-tokens';

/**
 * The `--sd-<surface>-content` PARSE contract, host-shell side.
 *
 * These specs are written against the strings hugmesh-generator's
 * `theme.css_string()` actually emits, not against a guess at CSS: that function
 * escapes `\` and `'`, and writes every newline as the CSS hex escape `\A ` (the
 * trailing space is a DELIMITER, not part of the text). A decoder that keeps that
 * space ships a footer with a leading blank on every line but the first, and one
 * that does not decode the escape at all ships the literal characters `\A` to the
 * operator's visitors. Both were one character away from each other, so both are
 * pinned.
 */
describe('parseChromeContent (--sd-<surface>-content contract)', () => {
  it('names the --sd-* token first and its --hug-* runtime twin second', () => {
    // Order is the contract, not a detail: the generator emits both, so reading
    // the twin FIRST would mean a hand-written theme that set only --sd-* was
    // silently ignored. Same order, same reason, as THEME_EFFECT_TOKENS.
    expect(chromeTokens('header', 'content')).toEqual([
      '--sd-header-content',
      '--hug-header-content',
    ]);
    expect(chromeTokens('footer', 'height')).toEqual(['--sd-footer-height', '--hug-footer-height']);
  });

  it('covers exactly the two surfaces the generator emits', () => {
    expect(CHROME_SURFACES).toEqual(['header', 'footer']);
  });

  it('unwraps the single-quoted literal css_string() emits', () => {
    expect(parseChromeContent("'Council of the Ninth Ward'")).toBe('Council of the Ninth Ward');
  });

  it('accepts a double-quoted literal, which a hand-written theme may use', () => {
    expect(parseChromeContent('"Council"')).toBe('Council');
  });

  it('decodes the \\A escape css_string() writes for a newline, WITHOUT its delimiter space', () => {
    // The exact token text observed from theme.css_string("Operated by the Ninth
    // Ward\nAll times UTC") on 2026-09-04.
    expect(parseChromeContent("'Operated by the Ninth Ward\\A All times UTC'")).toBe(
      'Operated by the Ninth Ward\nAll times UTC',
    );
  });

  it('decodes an escaped quote and an escaped backslash back to the operator text', () => {
    // css_string("It's a \\ mesh") -> 'It\'s a \\\\ mesh'
    expect(parseChromeContent("'It\\'s a \\\\ mesh'")).toBe("It's a \\ mesh");
  });

  it('eats exactly ONE delimiter space after a hex escape, and no more', () => {
    // css-syntax-3 §4.3.7: the whitespace that ends a hex escape is a delimiter
    // and is not part of the text; a SECOND space is text. Getting this wrong is
    // the difference between the operator's arrow and an arrow with a stray gap.
    expect(parseChromeContent("'\\2192 onward'")).toBe('→onward');
    expect(parseChromeContent("'\\2192  onward'")).toBe('→ onward');
  });

  it('drops a CSS line continuation (backslash before a real newline)', () => {
    expect(parseChromeContent("'one\\\ntwo'")).toBe('onetwo');
  });

  it('replaces a null / out-of-range codepoint rather than throwing', () => {
    expect(parseChromeContent("'\\0 x'")).toBe('�x');
    expect(parseChromeContent("'\\110000 x'")).toBe('�x');
  });

  it('takes an UNQUOTED value verbatim instead of refusing it', () => {
    // A hand-written `--sd-footer-content: hello` obviously means the word;
    // rejecting it would ship a blank footer with nothing to explain why.
    expect(parseChromeContent('  hello  ')).toBe('hello');
  });

  it('returns null for absent, empty, whitespace-only and non-string values', () => {
    // null means "the theme said nothing", which is what keeps the SHIPPED
    // content — the markup half of the generator's conservative-schema promise.
    expect(parseChromeContent('')).toBeNull();
    expect(parseChromeContent('   ')).toBeNull();
    expect(parseChromeContent("'   '")).toBeNull();
    expect(parseChromeContent("''")).toBeNull();
    expect(parseChromeContent(undefined)).toBeNull();
    expect(parseChromeContent(42)).toBeNull();
  });
});

describe('readChromeContent (which token wins on a live element)', () => {
  let probe: HTMLElement;

  beforeEach(() => {
    // A fixture element, never document.documentElement: a spec that writes the
    // real <html> leaks its theme into every later spec in the same browser.
    probe = document.createElement('div');
    document.body.appendChild(probe);
  });

  afterEach(() => probe.remove());

  it('reads the --sd-* token when both are set', () => {
    probe.style.setProperty('--sd-header-content', "'from sd'");
    probe.style.setProperty('--hug-header-content', "'from hug'");
    expect(readChromeContent('header', probe)).toBe('from sd');
  });

  it('falls back to the --hug-* runtime twin when only it is set', () => {
    probe.style.setProperty('--hug-footer-content', "'from hug'");
    expect(readChromeContent('footer', probe)).toBe('from hug');
  });

  it('returns null when the theme set neither', () => {
    expect(readChromeContent('header', probe)).toBeNull();
    expect(readChromeContent('footer', probe)).toBeNull();
  });
});
