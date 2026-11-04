#!/usr/bin/env bash
# release-version.sh — the version guard for .github/workflows/release.yml.
#
# Decides what kind of publish this run is, from the event and the ref, and
# refuses anything that is not one of the allowed shapes:
#
#   refs/heads/main          -> kind=main     (image tags :main + :sha-<12>)
#   refs/heads/release/X.Y   -> kind=branch   (image tag :sha-<12> only; the
#                                              version must be X.Y.*)
#   refs/tags/v<version>     -> kind=release  (channel beta for X.Y.Z-beta.N,
#                                              channel stable for X.Y.Z)
#
# Which image tags and GitHub Release flags a run gets, and which branch the
# tagged commit must be on (main for a beta, release/X.Y for a stable), is
# decided by scripts/release-channel.sh, which the workflow runs after this
# guard. A version is X.Y.Z or X.Y.Z-beta.N; any other pre-release (-rc.N, ...)
# names no release channel and is refused.
#
# The version source is package.json `.version`. package-lock.json must carry
# the same string in both of its version fields, so the image, the lock and the
# tag can never disagree. A pull_request run is always refused: this workflow
# publishes, and publishing never happens from a PR.
#
# Inputs (environment): GITHUB_EVENT_NAME, GITHUB_REF; optional REPO_ROOT
# (defaults to the directory above this script). Outputs `version`, `kind`,
# `prerelease` and `channel` as key=value lines on stdout, and appends them to
# $GITHUB_OUTPUT when that is set. Exit 1 with a reason on stderr otherwise.
#
# Tested by scripts/release-version.test.sh (npm run test:release-version).
set -euo pipefail

fail() {
  echo "release-version: $*" >&2
  exit 1
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=${REPO_ROOT:-"$script_dir/.."}
event=${GITHUB_EVENT_NAME:-}
ref=${GITHUB_REF:-}

[ -n "$event" ] || fail "GITHUB_EVENT_NAME is not set"
[ -n "$ref" ] || fail "GITHUB_REF is not set"

case "$event" in
  pull_request | pull_request_target)
    fail "refusing to publish from a $event run"
    ;;
esac

[ -f "$root/package.json" ] || fail "no package.json under $root"
[ -f "$root/package-lock.json" ] || fail "no package-lock.json under $root"

# One python call reads all three version fields; -I keeps it from importing
# anything out of the checkout.
versions=$(python3 -I - "$root/package.json" "$root/package-lock.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    pkg = json.load(f)
with open(sys.argv[2], encoding="utf-8") as f:
    lock = json.load(f)
root_pkg = (lock.get("packages") or {}).get("") or {}
print(pkg.get("version") or "")
print(lock.get("version") or "")
print(root_pkg.get("version") or "")
PY
) || fail "could not read package.json / package-lock.json"

pkg_version=$(printf '%s\n' "$versions" | sed -n 1p)
lock_version=$(printf '%s\n' "$versions" | sed -n 2p)
lock_root_version=$(printf '%s\n' "$versions" | sed -n 3p)

[ -n "$pkg_version" ] || fail "package.json has no version"
[ "$lock_version" = "$pkg_version" ] ||
  fail "package-lock.json version '$lock_version' does not match package.json '$pkg_version'"
[ "$lock_root_version" = "$pkg_version" ] ||
  fail "package-lock.json packages[\"\"].version '$lock_root_version' does not match package.json '$pkg_version'"

# MAJOR.MINOR.PATCH with an optional pre-release part. No `+build` metadata:
# OCI tags reject `+`. No SNAPSHOT: a published version is immutable.
semver='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
[[ "$pkg_version" =~ $semver ]] || fail "version '$pkg_version' is not MAJOR.MINOR.PATCH[-pre]"
case "$pkg_version" in
  *SNAPSHOT*) fail "version '$pkg_version' is a SNAPSHOT; never publish one" ;;
esac
# The only pre-release with a release channel is -beta.N (cut from main). A
# stable X.Y.Z has none and is cut from release/X.Y.
case "$pkg_version" in
  *-*)
    [[ "$pkg_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-beta\.[1-9][0-9]*$ ]] ||
      fail "version '$pkg_version' names no release channel: a version is X.Y.Z (stable, from release/X.Y) or X.Y.Z-beta.N (beta, from main)"
    ;;
esac
# MAJOR.MINOR of the version: the release/X.Y line it belongs on.
line=${pkg_version%%-*}
line=${line%.*}

case "$ref" in
  refs/heads/main)
    kind=main
    ;;
  refs/heads/release/*)
    branch=${ref#refs/heads/}
    [[ "$branch" =~ ^release/([0-9]+)\.([0-9]+)$ ]] ||
      fail "ref '$ref' publishes nothing: a release branch is named release/X.Y (for example release/0.3)"
    [ "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}" = "$line" ] ||
      fail "$branch carries package.json version $pkg_version; a release/X.Y branch must carry an X.Y.* version (this one belongs on release/$line)"
    kind=branch
    ;;
  refs/tags/v*)
    tag_version=${ref#refs/tags/v}
    [ "$tag_version" = "$pkg_version" ] ||
      fail "tag v$tag_version does not match package.json version $pkg_version"
    kind=release
    ;;
  *)
    fail "ref '$ref' publishes nothing: only refs/heads/main, refs/heads/release/X.Y and refs/tags/v<version> do"
    ;;
esac

case "$pkg_version" in
  *-*)
    prerelease=true
    channel=beta
    ;;
  *)
    # A stable release. Whether it also moves the floating :X.Y and :latest
    # tags is decided by scripts/release-channel.sh (newest line only).
    prerelease=false
    channel=stable
    ;;
esac

out=$(printf 'version=%s\nkind=%s\nprerelease=%s\nchannel=%s\n' \
  "$pkg_version" "$kind" "$prerelease" "$channel")
printf '%s\n' "$out"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf '%s\n' "$out" >>"$GITHUB_OUTPUT"
fi
