Feature: Games tier — menu visibility, derived-role gating, and the local placeholders
  The games tier is fully shipped host-side but had zero e2e. The Games Admin
  profile entry is gated on the DERIVED role isGamesAdmin() = ROLE_GAMES ∩
  (ROLE_ADMIN ∪ ROLE_MOD) (session.service.ts) — a bare games member AND a bare
  admin must BOTH be excluded (it is never granted directly). The /games and
  /games/admin routes are GUARDED LOCAL PLACEHOLDER components (no remote exists
  yet), so activating the Games Admin entry client-side navigates straight into a
  host-rendered TODO page — reachable host-only (the server.js no-SPA-fallback
  limit only bites SERVER deep links, not in-app navigation).

  Scenario: The derived games-admin tier sees the Games Admin entry
    Given I have a games-admin session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-games-admin"

  Scenario: A bare admin (no games role) does NOT see the Games Admin entry
    # ROLE_ADMIN alone does not earn the derived games-admin tier — the entry
    # stays hidden even though the menu is open and shows the admin consoles.
    Given I have an admin session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-admin"
    And the profile menu does not contain "menu-games-admin"

  Scenario: A bare games member does NOT see the Games Admin entry
    # ROLE_GAMES alone (the entry-point role) does not earn games-admin either —
    # default-deny on the derived tier.
    Given I have a games session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-profile"
    And the profile menu does not contain "menu-games-admin"

  Scenario: Activating Games Admin renders the honest local placeholder
    # Client-side nav into the host-local GamesAdminPlaceholderComponent — no
    # remote is mounted, so it shows an honest TODO badge, never a faked console.
    Given I have a games-admin session
    And I go to "/"
    When I open the profile menu
    And I activate the "menu-games-admin" menu item
    Then the games-admin placeholder renders

  @cluster
  Scenario: A bare moderator deep-linking /games lands on the denied landing, never /login
    # gamesGuard admits ROLE_GAMES | admin | superadmin; a bare mod without
    # ROLE_GAMES is refused. They are SIGNED IN, so this is an authorization
    # failure, and (issue #88) the guard answers it the way every other console
    # mount does: /home?denied=<path> plus the denied notice — never /login, which
    # is the anonymous destination and would tell a signed-in user to sign in.
    # @cluster because the deep link needs the SPA fallback env (server.js serves
    # index.html at '/' only); the landing itself is host-local, so no remote is
    # needed to settle the URL.
    Given I have a mod session
    When I go to "/games"
    Then the URL path is "/home"
    And the URL carries a denied query naming "/games"
    And the denied notice is visible

  @cluster
  Scenario: A games member deep-linking /games reaches the games placeholder
    Given I have a games session
    When I go to "/games"
    Then the games placeholder renders
