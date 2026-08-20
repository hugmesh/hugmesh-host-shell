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
# Usage: scripts/check-theme-token-contract.sh [path/to/.theme.css]
# Exits non-zero on a NEW orphan or on any dead-fallback read.
set -uo pipefail

cd "$(dirname "$0")/.."

WIRE="${1:-}"

# Tokens the shell itself declares (`  --hug-foo: ...`) — the :root contract block.
mapfile -t SHELL_DEFINED < <(grep -rhoE '^[[:space:]]*--hug-[a-z0-9-]+[[:space:]]*:' src/ \
  | tr -d ' \t:' | sort -u)

# Tokens the shell READS via var().
mapfile -t READ < <(grep -rhoE 'var\(--hug-[a-z0-9-]+' src/ | sed 's/^var(//' | sort -u)

# Shell-private hooks: deliberately NOT part of the generator's theme contract.
# They are opt-in overrides (a host page or an operator stylesheet may set them);
# every read carries a fallback, so being absent from the wire is by design.
PRIVATE=(--hug-header-scale --hug-nav-suffix --hug-nav-suffix-active --hug-nav-suffix-hover)

in_list() { local n=$1; shift; local x; for x in "$@"; do [[ "$x" == "$n" ]] && return 0; done; return 1; }

rc=0

# ── ORPHANS ────────────────────────────────────────────────────────────────
if [[ -n "$WIRE" && -f "$WIRE" ]]; then
  mapfile -t ONWIRE < <(grep -oE -- '--hug-[a-z0-9-]+' "$WIRE" | sort -u)
  echo "wire: $WIRE (${#ONWIRE[@]} --hug-* tokens)"
  orphans=()
  for t in "${READ[@]}"; do
    in_list "$t" "${ONWIRE[@]}"       && continue
    in_list "$t" "${SHELL_DEFINED[@]}" && continue
    in_list "$t" "${PRIVATE[@]}"      && continue
    orphans+=("$t")
  done
  if ((${#orphans[@]})); then
    echo "FAIL orphan --hug-* read (not on the wire, not shell-defined, not a known private hook):"
    printf '  %s\n' "${orphans[@]}"
    for t in "${orphans[@]}"; do grep -rn -- "var($t" src/ | sed 's/^/    /'; done
    rc=1
  else
    echo "PASS no orphan --hug-* reads (${#READ[@]} tokens read)"
  fi
else
  echo "SKIP orphan check — no theme css given (pass one as \$1)"
fi

# ── DEAD FALLBACKS ─────────────────────────────────────────────────────────
# A read of a shell-DEFINED token that still carries a fallback literal. Allowed
# only inside the :root contract block itself, where the declaration is
# `--hug-X: var(--sd-X, <literal>)` — a --sd-* read, so it never matches here.
dead=$(grep -rnE 'var\(--hug-[a-z0-9-]+[[:space:]]*,' src/ --include='*.scss' --include='*.css' \
  | while IFS= read -r line; do
      tok=$(sed -E 's/.*var\((--hug-[a-z0-9-]+)[[:space:]]*,.*/\1/' <<<"$line")
      in_list "$tok" "${SHELL_DEFINED[@]}" && echo "$line"
    done)
if [[ -n "$dead" ]]; then
  echo "FAIL dead fallback — token is defined by the shell's :root block, so the literal is unreachable:"
  sed 's/^/  /' <<<"$dead"
  rc=1
else
  echo "PASS no dead-fallback reads (${#SHELL_DEFINED[@]} shell-defined tokens)"
fi

exit $rc
