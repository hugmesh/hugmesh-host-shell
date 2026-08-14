#!/bin/sh
# 50-snap-theme.sh — runtime shell-chrome THEME injection (the login-ui
# mechanism, applied to the host shell).
#
# Writes /usr/share/nginx/html/snap-theme.css from $SNAP_THEME_CSS at container
# start; index.html links it, and its ":root:root { --sd-*: ... }" block beats
# the compiled var() fallbacks in styles.css by specificity. Rebrand = update
# the env + restart the container — NO image rebuild.
#
# ZERO colour maths happens here — deliberately. $SNAP_THEME_CSS carries token
# text ALREADY derived by the single implementation (hugmesh-generator
# studio/hugmesh_studio/core/theme.py + theme_presets.py, via the Studio GUI or
# scripts/tooling/derive-theme.py). A shell re-derivation would be a second
# implementation whose drift makes the Studio preview lie, so this script only
# writes the text verbatim.
#
# Unset/empty => an EMPTY snap-theme.css: the stylesheet resolves with zero
# bytes and every var(--sd-*, <literal>) fallback renders the shipped chrome
# byte-identically.
set -eu

OUT="${SNAP_THEME_OUT:-/usr/share/nginx/html/snap-theme.css}"

printf '%s' "${SNAP_THEME_CSS:-}" > "$OUT"

if [ -s "$OUT" ]; then
  echo "50-snap-theme.sh: wrote $OUT ($(wc -c < "$OUT") bytes)"
else
  echo "50-snap-theme.sh: wrote empty $OUT (no SNAP_THEME_CSS — shipped default chrome)"
fi
