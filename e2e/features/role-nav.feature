Feature: Universal nav and role-gated profile menu
  Every authenticated role sees the universal nav (Home | Mastodon | Matrix) and a
  profile dropdown (Profile + Sign out). The role-specific shortcuts are gated: the
  Admin entry on isAdmin() (roles includes 'admin'); the Moderation entry on
  isMod() (roles includes 'mod'). A plain user sees neither; a moderator sees
  Moderation only; a full-privilege admin (roles admin+mod) sees both. This is the
  role-gating / mod-isolation invariant at the UI level, asserted purely on the
  HOST — it needs no remote (the nav renders from the session signals alone).

  Background:
    Given I have a user session
    And I go to "/"

  Scenario: The universal nav entries are present for an authenticated role
    Then the navigation has a "nav-home" entry
    And the navigation has a "nav-mastodon" entry
    And the navigation has a "nav-matrix" entry

  Scenario: The profile dropdown opens on click and holds Profile + Sign out
    When I open the profile menu
    Then the profile menu is open
    And the profile menu contains "menu-profile"
    And the profile menu contains "menu-logout"

  Scenario: The profile dropdown opens with the keyboard
    When I open the profile menu with the keyboard
    Then the profile menu is open
    And the profile menu contains "menu-profile"

  Scenario: A plain user sees neither the Admin nor the Moderation entry
    When I open the profile menu
    Then the profile menu does not contain "menu-admin"
    And the profile menu does not contain "menu-mod"

  Scenario: A plain user sees no admin-tier console entries at all
    # DENY side of the console gating: API docs is admin-only; the Wiki / Owncast
    # / Tube service consoles need a role tier (or per-service grant) a bare
    # ROLE_USER does not hold (menu.component.ts canAccessWiki/Owncast/Tube).
    When I open the profile menu
    Then the profile menu does not contain "menu-apidocs"
    And the profile menu does not contain "menu-wiki"
    And the profile menu does not contain "menu-owncast"
    And the profile menu does not contain "menu-tube"

  Scenario: A moderator sees Moderation but NOT Admin
    Given I have a mod session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-mod"
    And the profile menu does not contain "menu-admin"

  Scenario: A bare moderator sees Owncast (stream moderation) but not Wiki, Tube or API docs
    # Per the actual host nav config: canAccessOwncast() includes plain isMod()
    # (the stream-moderation surface), while Wiki needs mod + the per-service
    # ROLE_WIKI grant, Tube needs ROLE_TUBE or the admin tier, and API docs is
    # admin-only. The mod fixture carries no per-service grants.
    Given I have a mod session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-owncast"
    And the profile menu does not contain "menu-wiki"
    And the profile menu does not contain "menu-tube"
    And the profile menu does not contain "menu-apidocs"

  Scenario: An admin sees both Admin and Moderation
    Given I have an admin session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-admin"
    And the profile menu contains "menu-mod"

  Scenario: An admin sees the admin-tier service consoles
    # ALLOW side for the admin tier: API docs (admin-only) plus the Wiki /
    # Owncast / Tube consoles, all of which admit isAdmin() without a
    # per-service grant.
    Given I have an admin session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-apidocs"
    And the profile menu contains "menu-wiki"
    And the profile menu contains "menu-owncast"
    And the profile menu contains "menu-tube"

  Scenario: A superadmin sees the admin nav — Admin, API docs and Moderation
    # The superadmin fixture carries the full role cascade (SUPERADMIN > ADMIN >
    # MOD > USER, delivered as lowercase strings in session.roles[]), so the
    # admin-gated (isAdmin) and mod-gated (isMod) entries all render.
    Given I have a superadmin session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-admin"
    And the profile menu contains "menu-apidocs"
    And the profile menu contains "menu-mod"

  Scenario: A superadmin sees every service console (Wiki, Owncast, Tube)
    # canAccessWiki/Owncast/Tube each admit isSuperadmin() unconditionally —
    # superadmin manages ALL service features (the cross-domain manage-all tier).
    Given I have a superadmin session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-wiki"
    And the profile menu contains "menu-owncast"
    And the profile menu contains "menu-tube"

  Scenario: A superadmin keeps the universal nav and the signed-in account region
    Given I have a superadmin session
    And I go to "/"
    Then the navigation has a "nav-home" entry
    And the navigation has a "nav-mastodon" entry
    And the navigation has a "nav-matrix" entry
    And the account region shows the signed-in profile menu
