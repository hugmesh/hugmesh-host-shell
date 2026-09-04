/**
 * The host shell's side of the theme CHROME contract — the generator's
 * `--sd-<surface>-*` axis for the header and footer.
 *
 * WHY THIS FILE EXISTS (issue #19 items 4 and 8). The generator has shipped a
 * complete web-chrome axis since the Themes editor grew it: `chrome_tokens()` in
 * hugmesh-generator `studio/hugmesh_studio/core/theme.py` emits, per surface and
 * ONLY when the operator deviates from the shipped page,
 *
 *   --sd-<s>-display: none   the surface is hidden outright
 *   --sd-<s>-height          one of CHROME_SIZES (compact 2.5rem / comfortable 4rem
 *                            / tall 6rem)
 *   --sd-<s>-bg              a flat background colour
 *   --sd-<s>-on              its auto black/white text twin (AA by construction)
 *   --sd-<s>-content         replacement text, as a CSS STRING LITERAL
 *
 * and NOTHING in the whole web fleet read any of them: a census on 2026-09-04
 * found 0 hits for every one of those names across this repo and hugmesh-login-ui,
 * so the QT editor's header/footer size, hide, background and replacement-content
 * controls were inert end to end — two contracts passing each other in the dark.
 * The shell was meanwhile scaling its banner from `--hug-header-scale`, a hook
 * with NO producer anywhere in the generator (0 hits for header-scale /
 * header_scale). This module, plus header/footer's own stylesheets, is the shell
 * becoming the axis's first consumer; `--hug-header-scale` stays as the
 * hand-authored escape hatch it always was.
 *
 * WHAT LIVES HERE AND WHAT LIVES IN CSS. Everything that is geometry or colour is
 * a plain `var()` fallback chain in the surface's own stylesheet — no JavaScript
 * can be faster than the stylesheet that is already parsed, and a hidden header
 * must not flash before a component runs. Only `--sd-<s>-content` needs code, for
 * an accessibility reason: the generator's own docstring tells consumers to pair a
 * `content:` read with alt-text syntax (`content: var(..) / ''`) precisely because
 * CSS-generated text is second-class in the accessibility tree. This shell takes
 * the other branch that docstring allows — REAL MARKUP — so a themed wordmark is
 * an ordinary text node inside the `<h1>`, indexable, selectable, translatable and
 * announced like any other heading.
 *
 * Pure data + pure functions, deliberately, exactly like `background.types.ts`:
 * every decision here is made without a DOM so it is unit-testable rather than
 * "looks fine on my machine". {@link ChromeThemeService} owns the live wiring.
 */

/** The two chrome surfaces the generator's axis addresses. */
export type ChromeSurface = 'header' | 'footer';

export const CHROME_SURFACES: readonly ChromeSurface[] = ['header', 'footer'];

/**
 * The custom properties one axis arrives on, in the order they are tried.
 *
 * `--sd-*` is the cross-repo contract token; `--hug-*` is its runtime twin — the
 * generator's `css_root` emits every `--sd-*` token a second time under the
 * `--hug-*` prefix, and this platform has already been burned once by reading only
 * one side of that pair (the theme rollout's prefix bug, which made the served
 * theme a silent no-op for the feature's whole life). Same order, same reason, as
 * `THEME_EFFECT_TOKENS` in `background/background.types.ts`.
 */
export function chromeTokens(surface: ChromeSurface, axis: string): readonly string[] {
  return [`--sd-${surface}-${axis}`, `--hug-${surface}-${axis}`];
}

/**
 * Decode one `--sd-<s>-content` declaration into the text it stands for.
 *
 * The generator emits this value through `theme.css_string()`, which produces a
 * CSS single-quoted string literal: `'` … `'`, with `\` and `'` backslash-escaped
 * and every newline written as the CSS escape `\A ` (hex codepoint plus ONE
 * trailing space, which is a delimiter and not part of the text). So decoding is
 * the inverse of that function plus the rest of CSS's own string grammar
 * (css-syntax-3 §4.3.7 / §4.3.8), because a hand-written theme is free to use
 * double quotes, other hex escapes, or an escaped literal newline continuation.
 *
 * Tolerant on purpose, the way a custom property demands: `getPropertyValue`
 * returns the token's RAW text. An UNQUOTED value is taken verbatim rather than
 * rejected — a hand-written `--sd-footer-content: hello` obviously means the word,
 * and refusing it would be a silent blank footer. Returns `null` for absent, empty
 * or whitespace-only text: `null` means "the theme said nothing", so the surface
 * keeps its shipped content, which is the conservative-schema guarantee the
 * generator makes on its side ("an all-defaults call returns {}").
 */
export function parseChromeContent(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let body = trimmed;
  const quote = trimmed[0];
  if ((quote === "'" || quote === '"') && trimmed.length >= 2 && trimmed.endsWith(quote)) {
    body = trimmed.slice(1, -1);
  }

  const text = unescapeCssString(body);
  return text.trim() ? text : null;
}

/**
 * CSS string unescaping. Three cases, in the order the grammar defines them:
 *
 *   `\` + 1-6 hex digits (+ one optional whitespace delimiter) -> that codepoint.
 *      This is the case that matters in production: `css_string()` writes every
 *      newline as `\A ` and nothing else can produce it.
 *   `\` + newline -> nothing. A line continuation inside the literal.
 *   `\` + anything else -> that character, unescaped. Covers `\\` and `\'`.
 *
 * A trailing lone backslash is dropped rather than kept, matching the CSS parser
 * (a `\` immediately before EOF is not a valid escape).
 */
function unescapeCssString(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const rest = body.slice(i + 1);
    if (!rest) break;
    const hex = /^([0-9a-fA-F]{1,6})(\r\n|[ \t\n\r\f])?/.exec(rest);
    if (hex) {
      const point = parseInt(hex[1], 16);
      // 0 and out-of-range codepoints are the replacement character per
      // css-syntax-3 §4.3.7 — never a thrown RangeError from fromCodePoint().
      out += point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)
        ? '�'
        : String.fromCodePoint(point);
      i += hex[0].length;
      continue;
    }
    const newline = /^(\r\n|[\n\r\f])/.exec(rest);
    if (newline) {
      i += newline[0].length;
      continue;
    }
    out += rest[0];
    i += 1;
  }
  return out;
}

/**
 * Read a surface's replacement content off the live document, or `null` when the
 * theme says nothing. The first token that HAS a value decides — the twins are
 * emitted together by the generator, so consulting the second is only ever a
 * fallback for a hand-written theme that set one and not the other.
 *
 * `root` exists for the specs, which set the tokens on a fixture element rather
 * than on the real `<html>` (a spec that writes to `document.documentElement`
 * leaks into every later spec in the same browser).
 */
export function readChromeContent(surface: ChromeSurface, root?: Element | null): string | null {
  if (typeof getComputedStyle !== 'function') return null;
  const element = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!element) return null;
  const style = getComputedStyle(element);
  for (const token of chromeTokens(surface, 'content')) {
    const raw = style.getPropertyValue(token);
    if (raw && raw.trim()) return parseChromeContent(raw);
  }
  return null;
}
