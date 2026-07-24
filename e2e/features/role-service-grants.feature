Feature: Per-service grant ALLOW side (ROLE_WIKI / ROLE_TUBE / ROLE_OWNCAST)
  role-nav.feature covers only the bare cascade tiers (user / mod / admin /
  superadmin). The GRANT-based ALLOW side — a sub-role like ROLE_WIKI that lets a
  MOD reach a service the cascade alone would not, or ROLE_TUBE that lets a plain
  USER reach Tube — was uncovered because the base fixture hardcodes only the four
  cascade role sets. These scenarios seed the base role PLUS the per-service grant
  and assert the menu's canAccessWiki/Tube/Owncast tiers (menu.component.ts), which
  mirror the wiki/tube/owncast route guards, so the entry is never a dead link.

  Asserted purely on the HOST — the profile menu renders from the session role
  signals alone; the @cluster deep-link ALLOW/DENY (actually reaching /wiki) needs
  the remotes served and is left to the integrated env.

  Scenario: A moderator granted ROLE_WIKI sees the Wiki console (but not Tube)
    # canAccessWiki = admin | superadmin | (mod AND ROLE_WIKI). The grant is what
    # lifts a mod into the wiki tier; without ROLE_TUBE the Tube entry stays hidden.
    Given I have a mod session with the "wiki" service grant
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-wiki"
    And the profile menu does not contain "menu-tube"
    And the profile menu does not contain "menu-apidocs"

  Scenario: A plain user granted ROLE_TUBE sees the Tube console (but not Wiki or Owncast)
    # canAccessTube = admin | superadmin | ROLE_TUBE. A bare user with the grant
    # reaches Tube; Wiki (needs mod+ROLE_WIKI) and Owncast (needs the owncast tier)
    # stay hidden — the grant is service-scoped, not a blanket console unlock.
    Given I have a user session with the "tube" service grant
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-tube"
    And the profile menu does not contain "menu-wiki"
    And the profile menu does not contain "menu-owncast"
    And the profile menu does not contain "menu-admin"

  Scenario: A plain user granted ROLE_OWNCAST sees the Owncast console (but not Tube or Wiki)
    # canAccessOwncast = ROLE_OWNCAST | admin | superadmin | mod. A bare user with
    # the grant reaches Owncast via the ROLE_OWNCAST leg; Tube and Wiki stay hidden.
    Given I have a user session with the "owncast" service grant
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-owncast"
    And the profile menu does not contain "menu-tube"
    And the profile menu does not contain "menu-wiki"

  @cluster
  Scenario: A moderator granted ROLE_WIKI can deep-link into the wiki remote
    # The @cluster ALLOW: the wiki remote's loadChildren must succeed for /wiki to
    # resolve (the remote is served in the integrated env).
    Given I have a mod session with the "wiki" service grant
    When I go to "/wiki"
    Then the URL path is "/wiki"

  @cluster
  Scenario: A plain user WITHOUT ROLE_WIKI deep-linking /wiki is bounced to /login
    # The @cluster DENY: wikiGuard rejects a bare user (no admin/superadmin, no
    # mod+ROLE_WIKI) and redirects to the login remote.
    Given I have a user session
    When I go to "/wiki"
    Then the URL path is "/login"
