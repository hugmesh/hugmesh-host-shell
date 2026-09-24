Feature: The animated background and header chrome read the active theme's token contract
  Issue #19 asked for two things this feature covers: the WebGL/CSS backdrop must
  take its colours from the active theme (not a fixed default), and the header's
  space usage must be configurable from the theme.

  RE-CHECKED AGAINST MAIN 2026-09-18 (issue #19, comment 2026-09-05): both halves
  are already landed here — background/theme-tokens.ts reads the `--hug-bg-*`
  palette live off `:root` (PR #20, PR #25) and chrome/chrome-tokens.ts reads the
  `--sd-header-height`/`--hug-header-height` density axis (PR #56, "item 4, shell
  half — DONE"). What is still open lives OUTSIDE this repo — the comment records
  that "effects are not yet *selectable in the theme maker*" (that editor is
  admin-ui's domain-themes screen) and that the generator's login-preview demo has
  no header-scale hook yet — so those two remaining half-checkboxes are not
  testable from this repo's own e2e suite. The first is pinned where the editor
  lives: hugmesh-admin-ui e2e/features/admin/theme-editor-axes.feature carries a
  `@fixme @issue:host-shell-19` scenario asserting an effect choice with more than
  one effect (`grep -rnwF "@issue:host-shell-19"` across the UI repos finds both
  files). The generator login-preview half has no scenario yet.

  This repo has no in-page theme maker of its own: the theme normally arrives as
  injected CSS text (`docker-entrypoint.d/50-snap-theme.sh` writing
  `snap-theme.css` from `$SNAP_THEME_CSS`, per background/theme-tokens.ts's own
  doc comment). These scenarios simulate that delivery the same way the doc
  comment says ANY mechanism that changes those custom properties does — setting
  them directly on `documentElement.style`, exactly like an injected stylesheet or
  a future in-page switcher would — and assert the shell's documented "restyles
  for free" contract actually holds, offline, with no live theme service needed.

  @issue:host-shell-19
  Scenario: the moving background renders the theme's declared gradient wash, not the shipped default
    Given I go to "/"
    When the active theme declares "--hug-bg-gradient" as "linear-gradient(0deg, rgb(17, 34, 51), rgb(17, 34, 51))"
    Then the background element's rendered gradient contains "rgb(17, 34, 51)"

  @issue:host-shell-19
  Scenario: the moving background falls back to the compiled brand when the theme declares nothing
    Given I go to "/"
    Then the background element's rendered gradient contains "rgb(255, 200, 221)"

  @issue:host-shell-19
  Scenario: the header shrinks to the theme's compact density token
    Given I go to "/"
    When the active theme declares "--sd-header-height" as "2.5rem"
    Then the header element's rendered height is close to 40 pixels

  @issue:host-shell-19
  Scenario: the header grows to the theme's tall density token
    Given I go to "/"
    When the active theme declares "--sd-header-height" as "6rem"
    Then the header element's rendered height is close to 96 pixels

  # ── Signed-in rows (issue #19 item 4, the "compact must not be cosmetic" and
  # "hide must not be a lockout" halves PR #56's second round fixed). The banner
  # is the shell's ONLY host of the account menu, the bell and both toggles, so
  # a density token is only honest if the control cluster still fits inside the
  # themed box, and a hide token is only honest if those controls survive it.
  # `I have a user session` seeds the JWT-shaped localStorage session the real
  # login remote writes (role.steps.js) — host-only, no served remotes needed.
  @issue:host-shell-19
  Scenario: a signed-in member's compact banner keeps the account controls inside it
    Given I have a user session
    And I go to "/"
    When the active theme declares "--sd-header-height" as "2.5rem"
    Then the header controls cluster sits inside the banner box
    And the "menubar-mode-toggle" header control is close to 22 pixels tall

  @issue:host-shell-19
  Scenario: a theme that hides the banner outright keeps the signed-in controls reachable
    Given I have a user session
    And I go to "/"
    When the active theme declares "--sd-header-display" as "none"
    Then the header wordmark is hidden
    And the "profile-trigger" header control is still visible
    And the "menubar-mode-toggle" header control is still visible
