# HugMesh branding — the two-tier palette rule

Brand: **HugMesh**. This host shell is the canonical source of the fleet's
brand identity: the favicon, the wordmark, the tab title, and the two-tier
palette contract below.

## Two accent families, one rule

The fleet deliberately runs **two** accent families. They are not a conflict to
"reconcile away" — each has a scope:

| Tier | Where it is defined | Who uses it |
| --- | --- | --- |
| **Host neon gold** on near-black | `src/styles/_tokens.scss` (`$neon #ffd700`, `$neon-bright #ffe566`, `$neon-dim #cc9900`; `$black #0a0a0a`, `$charcoal #111`, `$surface #1c1c1c`, `$offwhite #e8e8e8`; six pastels as the animated backdrop's **un-themed fallback** — a deploy with an injected `--sd-*` theme paints the backdrop from the theme instead, see `src/app/background/background.component.scss`) | **The host shell chrome ONLY** — the wordmark, nav, skip-link, background toggle, footer. |
| **Cross-repo `--hug-*` purple** (WCAG-AA/AAA) | `src/styles.scss` `:root` (`--hug-bg-0 #0a0a12`, `--hug-text #e8e8f0`, `--hug-accent #7c4dff` (bg/borders only), `--hug-accent-soft #b388ff` (accent text), …) | **Every federated remote** (login / user / mod / admin / api-docs / matrix / mastodon / forum / wiki / tube / owncast / character-studio / character-forge). Remotes are chromeless under federation and reach for these vars instead of pasting hex literals. |

**CANONICAL RULE:** gold = host chrome only; every remote styles exclusively with
the `--hug-*` purple contract. Gold leaking into a remote (skip-links, iframe link
colors) is drift, not brand. The `--hug-*` token set is defined here and mirrored
verbatim across the fleet; its origin/audit is
`hugmesh-games/frontend/src/styles.scss` (decision
`docs/wiki/decisions/024-wcag-palette-audit.md` in that repo, per-token contrast
ratios documented).

## Typography

- `$font-sans: Arial, Helvetica, sans-serif` — body text everywhere.
- `$font-mono: ui-monospace, 'Cascadia Mono', 'Courier New', monospace` — real
  mono for `<code>`, keys, ids (previously aliased to `$font-sans`, a fleet
  defect).
- `$font-fancy: 'More Sugar', $font-sans` — the display/wordmark face, wired via
  the `@font-face` in `styles.scss` from `src/assets/MoreSugar-Thin.ttf` (shipped
  + preloaded in `index.html`). Used by the host `h1` wordmark and by the
  paragraphs of the public home page (`src/app/home/home.component.scss`,
  `src/app/home/links/links.component.scss`).

## Marks & titles

- **Favicon:** `src/favicon.ico` — the fleet's only real icon asset (custom
  multi-resolution). Every standalone-served production surface should ship it.
- **Logo:** there is **no** logo image. The brand mark is the text-only `h1`
  wordmark "HugMesh" with a neon glow
  (`src/app/header/header.component.*`).
- **Production tab title:** "HugMesh" (`src/index.html`). In production this host
  owns the tab title. A remote's own dev-shell `index.html` uses "HugMesh
  &lt;Surface&gt; (remote)"; its comment calls the suffix "the sanctioned dev-shell
  convention" (`hugmesh-admin-ui` `src/index.html`). `hugmesh-login-ui` carries no
  suffix ("HugMesh Login").
- **In-page brand strings** use the domain form `hugmesh.net`.
