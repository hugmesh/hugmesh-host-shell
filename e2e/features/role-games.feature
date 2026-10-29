Feature: Games tier — nav + menu visibility, derived-role gating, and the games remote mounts
  The games member screens and the games admin console are ONE native-federation
  remote named 'games' (hugmesh-games/games-ui, cross-repo contract 2026-10-28),
  mounted by the host at /games (exposes ./routes -> GAMES_ROUTES, gamesGuard)
  and /games/admin (exposes ./admin-routes -> GAMES_ADMIN_ROUTES, gamesAdminGuard).
  The host-local TODO placeholders that stood in for both are gone.

  Visibility by role (menu.component.ts navEntries + header-controls.component.ts
  profileMenuItems, both mirroring the two guards so no entry is a dead link):
    - nav-games / menu-games — the member ENTRY POINT: isGames() | isAdmin() |
      isSuperadmin() (the gamesGuard predicate). Listed for every signed-in
      member like the other services; greyed with a reason for a plain user or
      a bare mod ("Sign in as a games member to open this.").
    - nav-games-admin / menu-games-admin — the CONSOLE: visible only on the
      DERIVED tier isGamesAdmin() = ROLE_GAMES ∩ (ROLE_ADMIN ∪ ROLE_MOD), or
      superadmin. A bare games member AND a bare admin are BOTH excluded.

  Host-only limit, stated honestly: this harness has no way to stub a federated
  remote (every remote-CONTENT scenario in this suite is @cluster, served by the
  remotes' own dev servers), so the offline scenarios assert the nav/menu entries
  per role and that activating Games makes the host ask for the games remote's
  entry at the contract URL (/games/remoteEntry.json — the REMOTE_ROUTES row
  resolving to the 'games' remote, observed at the network level). Reaching the
  rendered catalog/console is left to the @cluster deep links below.

  # ── member ENTRY POINT (nav-games / menu-games) ───────────────────────────

  @capabilities-mock
  Scenario: A bare games member (e2e-gamesonly) sees Games enabled in the nav and the profile menu, but no Games Admin
    Given the deployment reports the "games" and "forum" services installed
    And I have a games session
    And I go to "/"
    Then the navigation has a "nav-games" entry
    And the "nav-games" nav entry is an enabled link
    And the navigation has no "nav-games-admin" entry
    When I open the profile menu
    Then the profile menu contains "menu-games"
    And the profile menu does not contain "menu-games-admin"

  @capabilities-mock
  Scenario: Activating Games asks the gateway for the games remote entry at the contract URL
    # The route resolves to the REMOTE_ROUTES row {path 'games', remoteName
    # 'games', exposed './routes'}: gamesGuard admits the member and the deferred
    # loader fetches the 'games' manifest entry — /games/remoteEntry.json in the
    # prod manifest. Host-only there is nothing at that URL (404), so the remote
    # cannot render; the REQUEST is the contract this run can observe.
    Given the deployment reports the "games" and "forum" services installed
    And I have a games session
    And I go to "/"
    And I start capturing network requests
    When I select the "nav-games" nav entry
    Then the host requests the games remote entry at "/games/remoteEntry.json"

  @capabilities-mock
  Scenario: A bare admin (e2e-adminonly) sees Games enabled — gamesGuard admits admins to the entry point — but no Games Admin
    # ROLE_ADMIN alone reaches the catalog (management/oversight, the
    # wiki/tube/owncast precedent) but does NOT earn the derived console tier.
    Given the deployment reports the "games" and "forum" services installed
    And I have an admin session
    And I go to "/"
    Then the navigation has a "nav-games" entry
    And the "nav-games" nav entry is an enabled link
    And the navigation has no "nav-games-admin" entry
    When I open the profile menu
    Then the profile menu contains "menu-games"
    And the profile menu does not contain "menu-games-admin"

  @capabilities-mock
  Scenario: A plain user sees Games greyed with the games-member reason, and no Games Admin
    # grey + EXPLAIN, never hide (the service-entry convention): the entry tells a
    # member the service exists and why they cannot open it.
    Given the deployment reports the "games" and "forum" services installed
    And I have a user session
    And I go to "/"
    Then the navigation has a "nav-games" entry
    And the "nav-games" nav entry is disabled
    And the "nav-games" nav entry explains "Sign in as a games member to open this."
    And the navigation has no "nav-games-admin" entry
    When I open the profile menu
    Then the profile menu does not contain "menu-games"
    And the profile menu does not contain "menu-games-admin"

  @capabilities-mock
  Scenario: A bare moderator sees Games greyed too — mod alone does not earn the entry point
    Given the deployment reports the "games" and "forum" services installed
    And I have a mod session
    And I go to "/"
    Then the navigation has a "nav-games" entry
    And the "nav-games" nav entry is disabled
    And the "nav-games" nav entry explains "Sign in as a games member to open this."
    When I open the profile menu
    Then the profile menu does not contain "menu-games"

  Scenario: Without the games service installed, Games greys by install-state even for a games member
    # Host-only default: the capabilities read 404s, so nothing is installed and
    # the deployment reason dominates the role reason.
    Given I have a games session
    And I go to "/"
    Then the navigation has a "nav-games" entry
    And the "nav-games" nav entry is disabled
    And the "nav-games" nav entry explains "Games is not available on this deployment."

  # ── CONSOLE (nav-games-admin / menu-games-admin) ──────────────────────────

  @capabilities-mock
  Scenario: The derived games-admin tier sees Games AND Games Admin in the nav and the profile menu
    Given the deployment reports the "games" and "forum" services installed
    And I have a games-admin session
    And I go to "/"
    Then the navigation has a "nav-games" entry
    And the "nav-games" nav entry is an enabled link
    And the navigation has a "nav-games-admin" entry
    And the "nav-games-admin" nav entry is an enabled link
    When I open the profile menu
    Then the profile menu contains "menu-games"
    And the profile menu contains "menu-games-admin"

  @capabilities-mock
  Scenario: Activating Games Admin asks the gateway for the SAME games remote entry
    # /games/admin resolves to the REMOTE_ROUTES row {path 'games/admin',
    # remoteName 'games', exposed './admin-routes'} — one remote, two modules,
    # one remoteEntry.json.
    Given the deployment reports the "games" and "forum" services installed
    And I have a games-admin session
    And I go to "/"
    And I start capturing network requests
    When I select the "nav-games-admin" nav entry
    Then the host requests the games remote entry at "/games/remoteEntry.json"

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

  Scenario: Without the games service installed, the console entry stays visible for the derived tier but greys
    # A console a holder can never open on THIS deployment is still listed (they
    # hold the role), greyed with the deployment reason rather than a dead link.
    Given I have a games-admin session
    And I go to "/"
    Then the navigation has a "nav-games-admin" entry
    And the "nav-games-admin" nav entry is disabled
    And the "nav-games-admin" nav entry explains "Games is not available on this deployment."

  # ── @cluster deep links (the remote must be served to settle these) ───────

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
  Scenario: A bare games member deep-linking /games/admin lands on the denied landing
    Given I have a games session
    When I go to "/games/admin"
    Then the URL path is "/home"
    And the URL carries a denied query naming "/games/admin"
    And the denied notice is visible

  @cluster
  Scenario: A games member deep-linking /games reaches the games catalog
    # The games remote's ./routes must load (served in the integrated env) for
    # the URL to settle on /games; games-catalog is the remote's M1 testid.
    Given I have a games session
    When I go to "/games"
    Then the URL path is "/games"
    And the games remote eventually renders "games-catalog"

  @cluster
  Scenario: The derived games-admin tier deep-linking /games/admin reaches the games admin console
    Given I have a games-admin session
    When I go to "/games/admin"
    Then the URL path is "/games/admin"
    And the games remote eventually renders "games-admin-shell"
