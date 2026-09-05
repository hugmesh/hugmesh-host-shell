#!/usr/bin/env bash
# Theme-token contract gate for the shell's chrome SCSS.
#
# WHY THIS EXISTS
# ---------------
# The generator (theme.py `css_root`) emits every `--sd-*` token a second time
# under `--hug-*`, so a THEMED deploy cannot tell the two prefixes apart. The
# prefix a chrome rule reads therefore only decides what an UN-THEMED deploy
# renders — and there are exactly two ways to get that wrong:
#
#   ORPHAN   a `var(--hug-X, ...)` read where --hug-X is neither on the wire nor
#            defined by the shell: the rule can only ever paint its fallback, so
#            a theme silently cannot reach it.
#
#   DEAD-FALLBACK  a `var(--hug-X, <literal>)` read where --hug-X IS defined by
#            the shell's own :root contract block. Custom properties inherit, so
#            --hug-X is never "undefined" and <literal> is unreachable — the rule
#            silently paints the :root block's literal instead. When the two
#            literals differ (they do: --hug-accent-soft is #b388ff while the
#            link rules fall back to the brand gold), swapping a read onto the
#            --hug-* prefix repaints an un-themed deploy with no diff to show it.
#
# Usage: scripts/check-theme-token-contract.sh [path/to/theme.css ...]
# Every wire file given is unioned, so a base derivation and a preset theme can
# be checked together (the flag/extended-palette extras only exist in the latter).
# Exits non-zero on a NEW orphan or on any dead-fallback read.
set -uo pipefail

cd "$(dirname "$0")/.."

WIRES=("$@")

# Tokens the shell itself declares (`  --hug-foo: ...`) — the :root contract block.
mapfile -t SHELL_DEFINED < <(grep -rhoE '^[[:space:]]*--hug-[a-z0-9-]+[[:space:]]*:' src/ \
  | tr -d ' \t:' | sort -u)

# Tokens the shell READS via var(). `var(` may be followed by a newline and
# indentation before the token — background.component.scss's wash is written
# that way — so the whole tree is normalised (`var(<space>` -> `var(`) before
# extraction. Matching line-by-line silently missed those reads, which is how
# --hug-bg-gradient went unchecked.
mapfile -t READ < <(find src/ -type f \( -name '*.scss' -o -name '*.css' -o -name '*.ts' -o -name '*.html' \) -print0 \
  | xargs -0 perl -0777 -pe 's/var\(\s+/var(/g' \
  | grep -ohE 'var\(--hug-[a-z0-9-]+' | sed 's/^var(//' | sort -u)

# Shell-private hooks: deliberately NOT part of the generator's theme contract.
# They are opt-in overrides (a host page or an operator stylesheet may set them);
# every read carries a fallback, so being absent from the wire is by design.
PRIVATE=(--hug-header-scale --hug-nav-suffix --hug-nav-suffix-active --hug-nav-suffix-hover)

# CONDITIONAL contract tokens: part of the generator's theme contract, but only
# emitted when the chosen preset supplies the input they are derived from, so a
# PLAIN base derivation legitimately lacks them and their absence from one wire
# is not an orphan.
#   --hug-flag-stripes  theme_presets.py, only for a preset with `stripes`
#   --hug-bg-gradient   theme.py palette_tokens(), only with an extended palette
# Both are twinned from --sd-* by theme.py `css_root`, which BOTH compose_css()
# and delta_css() route through — so there is no path on which they reach a
# browser as --sd-* only. Pass a flag-preset theme as a second wire to check
# them positively rather than trusting this list.
#   --hug-{radius*,border-width,border-style,shadow*,surface-blur}
#                       theme.py style_tokens(), the STYLE axis. Reaches the wire
#                       through the DOMAIN theme (core/domain_theme.py, the
#                       admin-ui domain-themes editor), not through
#                       compose_login_css() — so a login-only theme carries none
#                       of them and the shipped shape ships. --hug-surface-blur
#                       is narrower still: only the `glass` variant emits it.
#   --hug-<surface>-{display,height,bg,on}
#                       theme.py chrome_tokens(), emitted per surface and ONLY
#                       for the axes the operator actually deviated on — an
#                       all-defaults call returns {} by design ("a config saved
#                       before these options existed composes byte-identical
#                       css"). So a base theme legitimately carries none of the
#                       eight, and their absence is the contract working, not an
#                       orphan. The --sd-* spelling is what the shell reads
#                       FIRST in every case (header/footer .component.scss); the
#                       --hug-* twin listed here is the runtime fallback.
CONDITIONAL=(--hug-flag-stripes --hug-bg-gradient
             --hug-header-display --hug-header-height --hug-header-bg --hug-header-on
             --hug-footer-display --hug-footer-height --hug-footer-bg --hug-footer-on
             --hug-radius --hug-radius-sm --hug-radius-lg
             --hug-border-width --hug-border-style
             --hug-shadow --hug-shadow-sm --hug-surface-blur)

in_list() { local n=$1; shift; local x; for x in "$@"; do [[ "$x" == "$n" ]] && return 0; done; return 1; }

rc=0

# ── ORPHANS ────────────────────────────────────────────────────────────────
present=()
for w in "${WIRES[@]}"; do [[ -f "$w" ]] && present+=("$w"); done

if ((${#present[@]})); then
  mapfile -t ONWIRE < <(grep -hoE -- '--hug-[a-z0-9-]+' "${present[@]}" | sort -u)
  echo "wire: ${present[*]} (${#ONWIRE[@]} --hug-* tokens unioned)"
  orphans=()
  for t in "${READ[@]}"; do
    in_list "$t" "${ONWIRE[@]}"        && continue
    in_list "$t" "${SHELL_DEFINED[@]}" && continue
    in_list "$t" "${PRIVATE[@]}"       && continue
    in_list "$t" "${CONDITIONAL[@]}"   && continue
    orphans+=("$t")
  done
  if ((${#orphans[@]})); then
    echo "FAIL orphan --hug-* read (not on the wire, not shell-defined, not a known private/conditional token):"
    printf '  %s\n' "${orphans[@]}"
    # Report by token name: a multi-line `var(` read has the token on its own
    # line, so grepping for "var(<token>" would print nothing at all.
    for t in "${orphans[@]}"; do grep -rn -- "$t" src/ | sed 's/^/    /'; done
    rc=1
  else
    echo "PASS no orphan --hug-* reads (${#READ[@]} tokens read)"
  fi
else
  echo "SKIP orphan check — NOT RUN, no theme css given. This half is unverified;"
  echo "     pass a base theme and a flag-preset theme as arguments to run it, e.g."
  echo "     $0 ../hugmesh-generator/tests/stack/.theme.css /tmp/pride.css"
fi

# ── DEAD FALLBACKS ─────────────────────────────────────────────────────────
# A read of a shell-DEFINED token that still carries a fallback literal. Allowed
# only inside the :root contract block itself, where the declaration is
# `--hug-X: var(--sd-X, <literal>)` — a --sd-* read, so it never matches here.
# Normalised per file, for the same multi-line `var(` reason as the read scan above.
dead=""
while IFS= read -r f; do
  while IFS= read -r tok; do
    [[ -n "$tok" ]] || continue
    in_list "$tok" "${SHELL_DEFINED[@]}" && dead+="$f: $tok"$'\n'
  done < <(perl -0777 -ne 's/var\(\s+/var(/g; while (/var\((--hug-[a-z0-9-]+)\s*,/g) { print "$1\n" }' "$f" | sort -u)
done < <(find src/ -type f \( -name '*.scss' -o -name '*.css' \))
if [[ -n "$dead" ]]; then
  echo "FAIL dead fallback — token is defined by the shell's :root block, so the literal is unreachable:"
  sed 's/^/  /' <<<"$dead"
  rc=1
else
  echo "PASS no dead-fallback reads (${#SHELL_DEFINED[@]} shell-defined tokens)"
fi

exit $rc
